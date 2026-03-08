import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { getDb } from "./db";
import {
  projects,
  actionsLog,
  architectureDecisions,
  analysisCache,
  ideas,
  ideaTasks,
  users,
} from "../drizzle/schema";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import { analyzeProjectCode } from "./analysis";
import { invokeLLM } from "./_core/llm";
import { invokeLLMWithEngine, getAiEngineConfig, updateSetting, type AiEngine } from "./aiEngine";
import { startWatcher, stopWatcher, getActiveWatchers } from "./gitWatcher";
import { sdk } from "./_core/sdk";
import bcrypt from "bcryptjs";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),

    // ── Auth locale VPS (login/mdp sans OAuth Manus) ──
    localLogin: publicProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string().min(6),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("DB unavailable");
        const rows = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
        const user = rows[0];
        if (!user || !user.passwordHash) throw new Error("Identifiants invalides");
        const valid = await bcrypt.compare(input.password, user.passwordHash);
        if (!valid) throw new Error("Identifiants invalides");
        // Créer session JWT
        const token = await sdk.createSessionToken(user.openId, { name: user.name ?? "" });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, cookieOptions);
        return { success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
      }),

    // ── Vérifier si un admin existe déjà ──
    hasAdmin: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return false;
      const rows = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
      return rows.length > 0;
    }),

    // ── Créer le premier compte admin (premier lancement uniquement) ──
    setupAdmin: publicProcedure
      .input(z.object({
        name: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(8),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("DB unavailable");
        // Vérifier qu'aucun admin n'existe
        const existing = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
        if (existing.length > 0) throw new Error("Un compte admin existe déjà");
        const hash = await bcrypt.hash(input.password, 12);
        const openId = `local-${Date.now()}`;
        await db.insert(users).values({
          openId,
          name: input.name,
          email: input.email,
          loginMethod: "local",
          role: "admin",
          passwordHash: hash,
          lastSignedIn: new Date(),
        });
        const rows = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
        const user = rows[0]!;
        const token = await sdk.createSessionToken(user.openId, { name: user.name ?? "" });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, cookieOptions);
        return { success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
      }),
  }),

  // ── Services Status ──
  services: router({
    status: protectedProcedure.query(async () => {
      const { execSync } = await import("child_process");
      const checkService = (name: string, cmd: string, successPattern?: string): { name: string; status: "up" | "down" | "unknown"; detail: string } => {
        try {
          const out = execSync(cmd, { timeout: 5000, encoding: "utf8" }).trim();
          const ok = successPattern ? out.includes(successPattern) : out.length > 0;
          return { name, status: ok ? "up" : "down", detail: out.slice(0, 80) };
        } catch {
          return { name, status: "down", detail: "Erreur de vérification" };
        }
      };

      const pipl = checkService("PIPL", "pm2 jlist 2>/dev/null | node -e \"const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));const p=d.find(x=>x.name==='pipl');process.stdout.write(p?p.pm2_env.status:'not found')\"", "online");
      const webhook = checkService("Webhook", "pm2 jlist 2>/dev/null | node -e \"const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));const p=d.find(x=>x.name==='pipl-webhook');process.stdout.write(p?p.pm2_env.status:'not found')\"", "online");
      const mysql = checkService("MySQL", "systemctl is-active mysql 2>/dev/null || systemctl is-active mariadb 2>/dev/null", "active");
      const nginx = checkService("Nginx", "systemctl is-active nginx 2>/dev/null", "active");

      // Lire les dernières alertes uptime
      let lastAlert = null;
      try {
        const { readFileSync } = await import("fs");
        const alertLog = "/home/ubuntu/uptime-alerts.log";
        const content = readFileSync(alertLog, "utf8").trim();
        const lines = content.split("\n").filter(Boolean);
        lastAlert = lines[lines.length - 1] ?? null;
      } catch { /* pas d'alertes */ }

      return { services: [pipl, webhook, mysql, nginx], lastAlert, checkedAt: new Date() };
    }),
  }),

  // ── Projects ──
  projects: router({
    list: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(projects).orderBy(desc(projects.createdAt));
    }),
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        localPath: z.string().min(1),
        description: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB unavailable");
        const result = await db.insert(projects).values({
          name: input.name,
          localPath: input.localPath,
          description: input.description ?? null,
        });
        const newId = Number((result as any).insertId);
        // Start Git watcher for the new project
        startWatcher(newId, input.localPath).catch(() => {});
        return { success: true, id: newId };
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        localPath: z.string().min(1).optional(),
        description: z.string().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB unavailable");
        const { id, ...rest } = input;
        await db.update(projects).set(rest).where(eq(projects.id, id));
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB unavailable");
        await db.delete(projects).where(eq(projects.id, input.id));
        return { success: true };
      }),
  }),

  // ── Actions Log ──
  actions: router({
    list: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        limit: z.number().default(50),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        return db
          .select()
          .from(actionsLog)
          .where(eq(actionsLog.projectId, input.projectId))
          .orderBy(desc(actionsLog.createdAt))
          .limit(input.limit);
      }),
    create: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        actionType: z.enum(["git_commit", "analysis", "deployment", "manual", "adr_created", "idea_promoted"]),
        title: z.string(),
        details: z.any().optional(),
        author: z.string().optional(),
        hash: z.string().optional(),
        branch: z.string().optional(),
        result: z.enum(["success", "failure", "pending"]).default("success"),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB unavailable");
        await db.insert(actionsLog).values(input);
        return { success: true };
      }),
    stats: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return { total: 0, commits: 0, analyses: 0 };
        const all = await db
          .select()
          .from(actionsLog)
          .where(eq(actionsLog.projectId, input.projectId));
        return {
          total: all.length,
          commits: all.filter(a => a.actionType === "git_commit").length,
          analyses: all.filter(a => a.actionType === "analysis").length,
        };
      }),

    // ── Vélocité Git : commits par jour sur les 14 derniers jours ──
    velocity: protectedProcedure
      .input(z.object({ projectId: z.number(), days: z.number().default(14) }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        const since = new Date();
        since.setDate(since.getDate() - input.days + 1);
        since.setHours(0, 0, 0, 0);

        // Récupérer tous les commits dans la fenêtre temporelle
        const rows = await db
          .select({ createdAt: actionsLog.createdAt })
          .from(actionsLog)
          .where(
            and(
              eq(actionsLog.projectId, input.projectId),
              eq(actionsLog.actionType, "git_commit"),
              gte(actionsLog.createdAt, since)
            )
          );

        // Construire un tableau de 14 jours avec count = 0 par défaut
        const result: { date: string; count: number }[] = [];
        for (let i = input.days - 1; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
          result.push({ date: key, count: 0 });
        }

        // Compter les commits par jour
        for (const row of rows) {
          const key = new Date(row.createdAt).toISOString().slice(0, 10);
          const entry = result.find(r => r.date === key);
          if (entry) entry.count++;
        }

        return result;
      }),
  }),

  // ── Architecture Decisions ──
  adr: router({
    list: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        return db
          .select()
          .from(architectureDecisions)
          .where(eq(architectureDecisions.projectId, input.projectId))
          .orderBy(desc(architectureDecisions.createdAt));
      }),
    create: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        title: z.string().min(1),
        context: z.string().optional(),
        decision: z.string().min(1),
        consequences: z.string().optional(),
        status: z.enum(["proposed", "accepted", "deprecated", "superseded"]).default("proposed"),
        category: z.string().default("architecture"),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB unavailable");
        // Auto-generate ADR ID
        const existing = await db
          .select()
          .from(architectureDecisions)
          .where(eq(architectureDecisions.projectId, input.projectId));
        const adrId = `ADR-${String(existing.length + 1).padStart(3, "0")}`;
        await db.insert(architectureDecisions).values({ ...input, adrId });
        // Log action
        await db.insert(actionsLog).values({
          projectId: input.projectId,
          actionType: "adr_created",
          title: `ADR créé : ${input.title}`,
          result: "success",
        });
        return { success: true, adrId };
      }),
    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["proposed", "accepted", "deprecated", "superseded"]),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB unavailable");
        await db
          .update(architectureDecisions)
          .set({ status: input.status })
          .where(eq(architectureDecisions.id, input.id));
        return { success: true };
      }),
    seed: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB unavailable");
        // Vérifier si des ADR existent déjà
        const existing = await db.select().from(architectureDecisions).where(eq(architectureDecisions.projectId, input.projectId));
        if (existing.length > 0) return { success: true, count: 0, message: "Des ADR existent déjà" };
        const seedData = [
          {
            title: "Migration vers PHP 8.4 (Infrastructure)",
            context: `Le projet Ma Commune tournait sur PHP 7.4, en fin de vie depuis novembre 2022. Le VPS Ubuntu 22.04 supporte PHP 8.4 via le dépôt ondrej/php. Les nouvelles fonctionnalités (enums, readonly properties, fibers, named arguments, match expressions) permettent d'écrire un code plus robuste et expressif.

**Contexte technique :**
- PHP 7.4 : fin de support sécurité le 28 nov. 2022
- Dépendances Composer incompatibles avec PHP 7.4 (fpdf2, phinx 0.14+)
- Extensions requises : pdo_mysql, mbstring, gd, zip, curl, intl, xml`,
            decision: `Migrer vers **PHP 8.4-FPM** sur Ubuntu 22.04 via le dépôt ondrej/php. Utiliser Nginx comme reverse proxy vers PHP-FPM sur socket Unix.

**Commandes d'installation :**
\`\`\`bash
add-apt-repository ppa:ondrej/php
apt install php8.4-fpm php8.4-mysql php8.4-mbstring \\
  php8.4-gd php8.4-zip php8.4-curl php8.4-xml php8.4-intl
\`\`\`

**Configuration Nginx (extrait) :**
\`\`\`nginx
location ~ \\.php$ {
    fastcgi_pass unix:/run/php/php8.4-fpm.sock;
    fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    include fastcgi_params;
}
\`\`\`

**Exemple de code PHP 8.4 utilisé dans le projet :**
\`\`\`php
// match expression (PHP 8.0+) dans IncidentController
$priority = match($input['priority']) {
    'high'   => 3,
    'medium' => 2,
    default  => 1,
};

// Named arguments (PHP 8.0+) dans Security.php
$clean = htmlspecialchars(
    string: strip_tags(trim($value)),
    flags: ENT_QUOTES | ENT_HTML5,
    encoding: 'UTF-8'
);
\`\`\``,
            consequences: `**Positif :**
- Performance améliorée de ~15% (JIT compiler activé)
- Compatibilité avec phinx 0.14+ pour les migrations
- Support sécurité jusqu'en décembre 2028

**Négatif :**
- Nécessite la mise à jour manuelle de toutes les extensions
- Incompatibilité possible avec certains packages Composer legacy

**Fichiers impactés :** backend/config/config.php, backend/composer.json, /etc/nginx/sites-available/ma-commune`,
            status: "accepted" as const,
            category: "infrastructure",
          },
          {
            title: "Architecture REST API PHP native sans framework",
            context: `Choix entre Laravel 11, Symfony 7, Slim 4 et une API PHP native. Le projet est de taille moyenne (21 tables, ~15 endpoints) avec des contraintes de performance sur un VPS 2 vCPU / 4 Go RAM.

**Comparaison évaluée :**
| Framework | RAM/req | Temps boot | Complexité |
|-----------|---------|------------|------------|
| Laravel 11 | ~45 MB | ~120ms | Élevée |
| Symfony 7 | ~35 MB | ~90ms | Élevée |
| Slim 4 | ~8 MB | ~15ms | Moyenne |
| PHP natif | ~4 MB | ~5ms | Faible |`,
            decision: `Implémenter une **API REST PHP native** avec :
- Routage manuel dans \`backend/index.php\`
- PDO + requêtes préparées pour la base de données
- JWT HS256 pour l'authentification stateless
- Système RBAC via \`core/Permissions.php\`

**Extrait du routeur (backend/index.php) :**
\`\`\`php
$resource = $segments[0] ?? '';
$id       = isset($segments[1]) ? Security::sanitizeId($segments[1]) : null;

switch ($resource) {
    case 'incidents':
        $ctrl = new IncidentController($db);
        match($method) {
            'GET'    => $id ? $ctrl->show($id) : $ctrl->index(),
            'POST'   => $ctrl->create(),
            'PUT'    => $ctrl->update($id),
            'DELETE' => $ctrl->delete($id),
        };
        break;
}
\`\`\`

**Système RBAC (core/Permissions.php) :**
\`\`\`php
private const MATRIX = [
    'incident:create'        => ['citizen', 'agent', 'admin'],
    'incident:update_status' => ['agent', 'admin'],
    'incident:delete'        => ['admin'],
    'user:manage'            => ['admin'],
];

public static function require(string $permission, array $auth): void {
    $role = $auth['role'] ?? 'citizen';
    if (!in_array($role, self::MATRIX[$permission] ?? [])) {
        http_response_code(403);
        exit(json_encode(['error' => 'Permission refusée']));
    }
}
\`\`\``,
            consequences: `**Positif :**
- Empreinte mémoire minimale (~4 MB par requête)
- Aucune dépendance framework à maintenir
- Flexibilité totale sur l'architecture

**Négatif :**
- Courbe d'apprentissage pour les nouveaux contributeurs habitués à Laravel
- Pas d'ORM natif (requêtes SQL manuelles)
- Pas de système de middleware automatique

**Fichiers clés :** backend/index.php, backend/core/BaseController.php, backend/core/Permissions.php`,
            status: "accepted" as const,
            category: "architecture",
          },
          {
            title: "Authentification 2FA (TOTP + Email OTP)",
            context: `La plateforme gère des données citoyennes sensibles (signalements géolocalisés, identités). Une authentification simple par mot de passe est insuffisante pour les comptes administrateurs et agents.

**Menaces identifiées :**
- Brute force sur /auth/login (mitigé par RateLimiter : 10 req/15min par IP)
- Credential stuffing depuis des bases de données leakées
- Sessions volées par XSS (mitigé par HttpOnly cookies)

**Exigences :**
- 2FA obligatoire pour les rôles admin et agent
- 2FA optionnel pour les citoyens
- Support TOTP (Google Authenticator) en v1.3`,
            decision: `Implémenter un système 2FA en deux phases :

**Phase 1 (v1.2 — actuelle) : Email OTP**
\`\`\`php
// TwoFactorController.php — Envoi du code
$code = sprintf('%06d', random_int(0, 999999));
$expiry = date('Y-m-d H:i:s', time() + 900); // 15 min

$stmt = $this->db->prepare(
    'UPDATE users SET two_factor_code = ?, two_factor_expiry = ? WHERE id = ?'
);
$stmt->execute([$code, $expiry, $userId]);
// Envoi par email via PushNotificationService
\`\`\`

**Phase 2 (v1.3 — planifiée) : TOTP**
\`\`\`php
// Setup TOTP — génération du secret
$secret = Base32::encode(random_bytes(20));
$qrUrl  = "otpauth://totp/" . APP_NAME . ":" . $email
        . "?secret=" . $secret . "&issuer=" . APP_NAME;

$stmt = $this->db->prepare(
    'UPDATE users SET two_factor_secret = ?, two_factor_method = "pending_totp" WHERE id = ?'
);
$stmt->execute([$secret, $userId]);
\`\`\`

**Rate limiting sur les endpoints 2FA :**
\`\`\`php
'auth_2fa' => ['ip' => ['requests' => 10, 'window' => 600]]
// 10 tentatives max par 10 minutes par IP
\`\`\``,
            consequences: `**Positif :**
- Sécurité renforcée pour les comptes privilégiés
- Compatible avec tous les clients email
- TOTP prévu pour réduire la dépendance SMTP

**Négatif :**
- Dépendance au service email (SMTP) pour la phase 1
- Expérience utilisateur légèrement alourdie (+1 étape)
- Codes de récupération à stocker de façon sécurisée

**Fichiers impactés :** backend/controllers/TwoFactorController.php, backend/core/RateLimiter.php, database/migrations/`,
            status: "accepted" as const,
            category: "securite",
          },
          {
            title: "Conformité RGAA 4.1 — Accessibilité niveau AA",
            context: `Ma Commune est une plateforme citoyenne publique. La loi française (article 47 de la loi n°2005-102) et le RGAA 4.1 imposent l'accessibilité numérique pour les services publics. L'application mobile React Native doit être utilisable par les personnes en situation de handicap (visuel, moteur, cognitif).

**Critères prioritaires RGAA 4.1 (niveau AA) :**
- Critère 1.1 : Chaque image a un texte alternatif
- Critère 3.2 : Contraste minimum 4.5:1 (texte normal)
- Critère 4.1 : Chaque média a une transcription
- Critère 7.1 : Navigation clavier complète
- Critère 10.1 : Pas de mise en forme via attributs HTML dépréciés`,
            decision: `Adopter le **RGAA 4.1** comme standard d'accessibilité avec les actions suivantes :

**1. Attributs ARIA dans l'app mobile (React Native) :**
\`\`\`tsx
// Bouton de signalement accessible
<TouchableOpacity
  accessible={true}
  accessibilityLabel="Signaler un problème dans votre commune"
  accessibilityRole="button"
  accessibilityHint="Ouvre le formulaire de signalement"
>
  <Text>Signaler</Text>
</TouchableOpacity>

// Image avec description
<Image
  source={{ uri: incident.photo }}
  accessibilityLabel={\`Photo du signalement : \${incident.title}\`}
/>
\`\`\`

**2. Contraste des couleurs (admin PHP) :**
\`\`\`css
/* Ratio 7:1 pour le texte principal */
:root {
  --color-text: #1a1a2e;      /* sur fond blanc : ratio 16.1:1 ✓ */
  --color-accent: #2563eb;    /* sur fond blanc : ratio 5.9:1 ✓ */
  --color-danger: #dc2626;    /* sur fond blanc : ratio 4.6:1 ✓ */
}
\`\`\`

**3. Navigation clavier :**
\`\`\`html
<!-- Skip link pour sauter au contenu principal -->
<a href="#main-content" class="skip-link">
  Aller au contenu principal
</a>
<main id="main-content" tabindex="-1">...</main>
\`\`\``,
            consequences: `**Positif :**
- Conformité légale (obligation pour les services publics)
- Améliore l'UX pour tous les utilisateurs (pas seulement les personnes handicapées)
- Meilleur référencement SEO (les critères RGAA améliorent le score Lighthouse)

**Négatif :**
- Travail supplémentaire estimé à 3 semaines de développement
- Audit d'accessibilité externe recommandé avant mise en production
- Formation de l'équipe aux outils (axe-core, NVDA, VoiceOver)

**Outils d'audit :** axe DevTools, Lighthouse, NVDA (Windows), VoiceOver (macOS/iOS)
**Fichiers impactés :** mobile/src/components/, backend/public/admin/`,
            status: "proposed" as const,
            category: "ux",
          },
          {
            title: "Généralisation du projet (variables d'environnement)",
            context: `Le projet était initialement développé spécifiquement pour la CCDS (Communauté de Communes de Guyane). 27 fichiers contenaient des références hardcodées (\"CCDS\", \"Guyane\", \"ccds_\") rendant impossible le déploiement pour une autre commune sans modifications manuelles extensives.

**Références hardcodées identifiées :**
- Préfixe de référence : \"CCDS-\" dans les numéros de signalement
- Nom de l'organisation dans les emails et PDF
- Identifiants de base de données : \"ccds_db\", \"ccds_user\"
- Headers HTTP : \"X-CCDS-Version\"
- 8 fichiers TypeScript (app mobile)
- 19 fichiers PHP (backend)`,
            decision: `Externaliser toutes les références dans des **variables d'environnement** via un fichier \`.env\` :

**Variables créées (.env.example) :**
\`\`\`bash
# Identité de l'application
APP_NAME="Ma Commune"
APP_SHORT_NAME="MaCommune"
APP_SLUG="ma_commune"
APP_SUBTITLE="Votre commune - Administration"
APP_REFERENCE_PREFIX="MC"   # Préfixe des numéros de signalement
APP_EMAIL_FROM="noreply@macommune.fr"

# Base de données
DB_HOST=localhost
DB_NAME=ma_commune_db
DB_USER=ma_commune_user
DB_PASSWORD=
\`\`\`

**Exemple de migration dans helpers.php :**
\`\`\`php
// AVANT (hardcodé)
function generate_reference(): string {
    return 'CCDS-' . date('Y') . '-' . str_pad(rand(1, 9999), 4, '0', STR_PAD_LEFT);
}

// APRÈS (configurable)
function generate_reference(): string {
    $prefix = defined('APP_REFERENCE_PREFIX') ? APP_REFERENCE_PREFIX : 'MC';
    return $prefix . '-' . date('Y') . '-' . str_pad(rand(1, 9999), 4, '0', STR_PAD_LEFT);
}
\`\`\`

**Exemple dans WebhookController.php :**
\`\`\`php
// AVANT
header('X-CCDS-Version: 1.6');

// APRÈS
header('X-' . APP_SHORT_NAME . '-Version: ' . APP_VERSION);
\`\`\``,
            consequences: `**Positif :**
- Le projet est désormais exportable vers n'importe quelle commune en France
- Configuration initiale en moins de 10 minutes via \`.env\`
- Branche \`feature/generic-rename-ma-commune\` fusionnée (commit c8205ee)

**Négatif :**
- 27 fichiers modifiés — risque de régression si des références ont été oubliées
- Les instances existantes doivent migrer leur configuration
- Documentation à mettre à jour

**Statistiques :** 27 fichiers modifiés, 8 variables d'environnement créées, 0 référence CCDS/Guyane restante dans le code fonctionnel`,
            status: "accepted" as const,
            category: "architecture",
          },
        ];
        let count = 0;
        for (const adr of seedData) {
          const adrId = `ADR-${String(count + 1).padStart(3, "0")}`;
          await db.insert(architectureDecisions).values({ ...adr, projectId: input.projectId, adrId });
          count++;
        }
        await db.insert(actionsLog).values({
          projectId: input.projectId,
          actionType: "adr_created",
          title: `${count} ADR de démonstration créées`,
          result: "success",
        });
        return { success: true, count };
      }),
    linkToNode: protectedProcedure
      .input(z.object({ id: z.number(), nodeId: z.string().nullable() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB unavailable");
        await db
          .update(architectureDecisions)
          .set({ linkedNodeId: input.nodeId })
          .where(eq(architectureDecisions.id, input.id));
        return { success: true };
      }),
    listByNode: protectedProcedure
      .input(z.object({ projectId: z.number(), nodeId: z.string() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        return db
          .select()
          .from(architectureDecisions)
          .where(
            and(
              eq(architectureDecisions.projectId, input.projectId),
              eq(architectureDecisions.linkedNodeId, input.nodeId)
            )
          )
          .orderBy(desc(architectureDecisions.createdAt));
      }),
  }),

  // ── Git Watcher ──
  gitWatcher: router({
    status: protectedProcedure.query(() => ({
      activeWatchers: getActiveWatchers(),
    })),
    start: protectedProcedure
      .input(z.object({ projectId: z.number(), localPath: z.string() }))
      .mutation(async ({ input }) => {
        await startWatcher(input.projectId, input.localPath);
        return { success: true };
      }),
    stop: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .mutation(({ input }) => {
        stopWatcher(input.projectId);
        return { success: true };
      }),
  }),

  // ── Report Generator ──
  report: router({
    generate: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB unavailable");
        const [projectList, actionsList, adrList, ideasList, tasksList, cacheList] = await Promise.all([
          db.select().from(projects).where(eq(projects.id, input.projectId)),
          db.select().from(actionsLog).where(eq(actionsLog.projectId, input.projectId)).orderBy(desc(actionsLog.createdAt)),
          db.select().from(architectureDecisions).where(eq(architectureDecisions.projectId, input.projectId)).orderBy(desc(architectureDecisions.createdAt)),
          db.select().from(ideas).where(eq(ideas.projectId, input.projectId)),
          db.select().from(ideaTasks).where(eq(ideaTasks.projectId, input.projectId)),
          db.select().from(analysisCache).where(eq(analysisCache.projectId, input.projectId)).orderBy(desc(analysisCache.analyzedAt)).limit(1),
        ]);
        const project = projectList[0];
        if (!project) throw new Error("Project not found");
        return {
          project,
          actions: actionsList,
          adrs: adrList,
          ideas: ideasList,
          tasks: tasksList,
          architecture: cacheList[0] ?? null,
          generatedAt: new Date().toISOString(),
        };
      }),
  }),

  // ── Architecture Analysis ──
  analysis: router({
    analyze: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        localPath: z.string(),
        label: z.string().optional(), // Nom optionnel du snapshot
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB unavailable");
        const result = await analyzeProjectCode(input.localPath);
        // Conserver TOUS les snapshots (ne plus supprimer l'ancien)
        const now = new Date();
        const autoLabel = input.label ??
          `Snapshot du ${now.toLocaleDateString("fr-FR")} à ${now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
        await db.insert(analysisCache).values({
          projectId: input.projectId,
          label: autoLabel,
          nodeCount: result.nodes.length,
          edgeCount: result.edges.length,
          nodes: result.nodes as any,
          edges: result.edges as any,
        });
        // Update project lastAnalyzedAt
        await db
          .update(projects)
          .set({ lastAnalyzedAt: now })
          .where(eq(projects.id, input.projectId));
        // Log action
        await db.insert(actionsLog).values({
          projectId: input.projectId,
          actionType: "analysis",
          title: `Analyse : ${autoLabel}`,
          details: { nodeCount: result.nodes.length, edgeCount: result.edges.length } as any,
          result: "success",
        });
        return result;
      }),
    getCache: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return null;
        const cache = await db
          .select()
          .from(analysisCache)
          .where(eq(analysisCache.projectId, input.projectId))
          .orderBy(desc(analysisCache.analyzedAt))
          .limit(1);
        return cache[0] ?? null;
      }),
    listSnapshots: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        // Return all snapshots without the heavy nodes/edges JSON
        const rows = await db
          .select({
            id: analysisCache.id,
            projectId: analysisCache.projectId,
            label: analysisCache.label,
            nodeCount: analysisCache.nodeCount,
            edgeCount: analysisCache.edgeCount,
            analyzedAt: analysisCache.analyzedAt,
          })
          .from(analysisCache)
          .where(eq(analysisCache.projectId, input.projectId))
          .orderBy(desc(analysisCache.analyzedAt));
        return rows;
      }),
    getSnapshot: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return null;
        const rows = await db
          .select()
          .from(analysisCache)
          .where(eq(analysisCache.id, input.id))
          .limit(1);
        return rows[0] ?? null;
      }),
    deleteSnapshot: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB unavailable");
        await db.delete(analysisCache).where(eq(analysisCache.id, input.id));
        return { success: true };
      }),
    diff: protectedProcedure
      .input(z.object({ snapshotAId: z.number(), snapshotBId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB unavailable");
        const [rowsA, rowsB] = await Promise.all([
          db.select().from(analysisCache).where(eq(analysisCache.id, input.snapshotAId)).limit(1),
          db.select().from(analysisCache).where(eq(analysisCache.id, input.snapshotBId)).limit(1),
        ]);
        const snapA = rowsA[0];
        const snapB = rowsB[0];
        if (!snapA || !snapB) throw new Error("Snapshot introuvable");

        const nodesA: any[] = Array.isArray(snapA.nodes) ? snapA.nodes as any[] : [];
        const nodesB: any[] = Array.isArray(snapB.nodes) ? snapB.nodes as any[] : [];
        const edgesA: any[] = Array.isArray(snapA.edges) ? snapA.edges as any[] : [];
        const edgesB: any[] = Array.isArray(snapB.edges) ? snapB.edges as any[] : [];

        const mapA = new Map(nodesA.map((n: any) => [n.id, n]));
        const mapB = new Map(nodesB.map((n: any) => [n.id, n]));
        const edgeMapA = new Map(edgesA.map((e: any) => [e.id, e]));
        const edgeMapB = new Map(edgesB.map((e: any) => [e.id, e]));

        // Node diff
        const addedNodes = nodesB.filter((n: any) => !mapA.has(n.id));
        const removedNodes = nodesA.filter((n: any) => !mapB.has(n.id));
        const modifiedNodes = nodesB.filter((n: any) => {
          const a = mapA.get(n.id);
          return a && (a.label !== n.label || a.type !== n.type || a.file !== n.file);
        });
        const unchangedNodes = nodesB.filter((n: any) => {
          const a = mapA.get(n.id);
          return a && a.label === n.label && a.type === n.type && a.file === n.file;
        });

        // Edge diff
        const addedEdges = edgesB.filter((e: any) => !edgeMapA.has(e.id));
        const removedEdges = edgesA.filter((e: any) => !edgeMapB.has(e.id));

        return {
          snapshotA: { id: snapA.id, label: snapA.label, analyzedAt: snapA.analyzedAt, nodeCount: snapA.nodeCount, edgeCount: snapA.edgeCount },
          snapshotB: { id: snapB.id, label: snapB.label, analyzedAt: snapB.analyzedAt, nodeCount: snapB.nodeCount, edgeCount: snapB.edgeCount },
          nodes: { added: addedNodes, removed: removedNodes, modified: modifiedNodes, unchanged: unchangedNodes },
          edges: { added: addedEdges, removed: removedEdges },
          summary: {
            nodesAdded: addedNodes.length,
            nodesRemoved: removedNodes.length,
            nodesModified: modifiedNodes.length,
            nodesUnchanged: unchangedNodes.length,
            edgesAdded: addedEdges.length,
            edgesRemoved: removedEdges.length,
          },
        };
      }),
  }),

  // ── UI-Code Bridge ──
  uiCode: router({
    analyzeScreenshot: protectedProcedure
      .input(z.object({
        imageUrl: z.string(),
        projectId: z.number(),
        localPath: z.string().optional(),
        screenLabel: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        // Résoudre localPath depuis projectId si non fourni
        let resolvedLocalPath = input.localPath;
        if (!resolvedLocalPath && input.projectId) {
          try {
            const { getDb } = await import("./db");
            const db = await getDb();
            const { projects } = await import("../drizzle/schema");
            const { eq } = await import("drizzle-orm");
            const proj = await db!.select().from(projects).where(eq(projects.id, input.projectId)).limit(1);
            if (proj[0]) resolvedLocalPath = proj[0].localPath;
          } catch { /* ignorer */ }
        }
        // Lire un extrait du code source pertinent si localPath est fourni
        let codeContext = "";
        if (resolvedLocalPath) {
          try {
            const { searchInFiles } = await import("./analysis");
            // Chercher les fichiers PHP et React Native liés à cet écran
            const label = input.screenLabel ?? "";
            const keywords = label ? label.split(/[\s&]+/).filter(w => w.length > 3) : ["incident", "signalement"];
            const allMatches: string[] = [];
            for (const kw of keywords.slice(0, 3)) {
              const matches = await searchInFiles(resolvedLocalPath, kw);
              matches.slice(0, 5).forEach(m => {
                allMatches.push(`// ${m.file}:${m.line}\n${m.context.join("\n")}`);
              });
            }
            if (allMatches.length > 0) {
              codeContext = `\n\nContexte du code source (${resolvedLocalPath}):\n\`\`\`\n${allMatches.slice(0, 10).join("\n---\n")}\n\`\`\``;
            }
          } catch {
            // Ignorer les erreurs de lecture de fichiers
          }
        }
        // Liste des fichiers sources connus du projet
        const phpFiles = ["dashboard.php","incidents.php","incident_detail.php","map.php","stats.php","realtime_dashboard.php","predictive_analysis.php","polls_admin.php","events_admin.php","users.php","categories.php","notifications.php","search.php","audit_logs.php","moderation.php","login.php"];
        const rnFiles = ["LoginScreen.tsx","MapScreen.tsx","CreateIncidentScreen.tsx","MyIncidentsScreen.tsx","IncidentDetailScreen.tsx","DashboardScreen.tsx","NotificationsScreen.tsx","EventsScreen.tsx","ProfileScreen.tsx","App.tsx"];
        const isWeb = !input.screenLabel?.toLowerCase().includes("mobile") && !input.screenLabel?.toLowerCase().includes("connexion") && !input.screenLabel?.toLowerCase().includes("créer") && !input.screenLabel?.toLowerCase().includes("mes signal");
        const fileList = isWeb ? phpFiles.map(f => `admin/pages/${f}`) : rnFiles.map(f => `mobile/src/screens/${f}`);
        const fileListStr = fileList.join(", ");

        const aiConfig = await getAiEngineConfig();
        const response = await invokeLLMWithEngine({
          messages: [
            {
              role: "system",
              content: `Tu es un expert en analyse d'interfaces utilisateur et en développement PHP/React Native pour le projet Ma Commune (CCDS Guyane). Analyse le screenshot et identifie tous les éléments interactifs visibles. Pour sourceFile, choisis UNIQUEMENT parmi ces fichiers réels du projet : ${fileListStr}. Si tu n'es pas sûr, laisse sourceFile vide (""). Ne génère JAMAIS de chemins inventés. Réponds UNIQUEMENT en JSON valide.${codeContext}`,
            },
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: { url: input.imageUrl, detail: "high" },
                },
                {
                  type: "text",
                  text: `Analyse cette interface${input.screenLabel ? ` (${input.screenLabel})` : ""}. Identifie tous les éléments interactifs. Retourne un JSON avec: { elements: [{ id: string, type: 'button'|'link'|'input'|'menu'|'tab'|'other', label: string, x: number, y: number, width: number, height: number, sourceFile: string }] } où x,y,width,height sont des pourcentages (0-100). Pour sourceFile, utilise UNIQUEMENT les fichiers de la liste fournie dans le system prompt, ou "" si incertain.`,
                },
              ],
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "ui_elements",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  elements: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        type: { type: "string" },
                        label: { type: "string" },
                        x: { type: "number" },
                        y: { type: "number" },
                        width: { type: "number" },
                        height: { type: "number" },
                        sourceFile: { type: "string" },
                      },
                      required: ["id", "type", "label", "x", "y", "width", "height", "sourceFile"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["elements"],
                additionalProperties: false,
              },
            },
          },
        });
        const content = response.choices[0]?.message?.content ?? "{}";
        const parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
        return parsed as { elements: Array<{ id: string; type: string; label: string; x: number; y: number; width: number; height: number; sourceFile: string }> };
      }),
    searchInCode: protectedProcedure
      .input(z.object({ localPath: z.string(), searchText: z.string() }))
      .mutation(async ({ input }) => {
        const { searchInFiles } = await import("./analysis");
        return searchInFiles(input.localPath, input.searchText);
      }),
  }),

  // ── Ideas ──
  ideas: router({
    list: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        return db
          .select()
          .from(ideas)
          .where(eq(ideas.projectId, input.projectId))
          .orderBy(desc(ideas.createdAt));
      }),
    create: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        title: z.string().min(1),
        description: z.string().optional(),
        parentId: z.number().optional(),
        positionX: z.number().default(0),
        positionY: z.number().default(0),
        color: z.string().default("#58a6ff"),
        priority: z.enum(["haute", "moyenne", "basse"]).default("moyenne"),
        category: z.string().default("fonctionnalite"),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB unavailable");
        const result = await db.insert(ideas).values({
          projectId: input.projectId,
          title: input.title,
          description: input.description ?? null,
          parentId: input.parentId ?? null,
          positionX: input.positionX,
          positionY: input.positionY,
          color: input.color,
          priority: input.priority,
          category: input.category,
        });
        return { success: true, id: Number((result as any).insertId) };
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        description: z.string().optional(),
        status: z.enum(["exploring", "promising", "in_progress", "promoted", "abandoned"]).optional(),
        priority: z.enum(["haute", "moyenne", "basse"]).optional(),
        category: z.string().optional(),
        positionX: z.number().optional(),
        positionY: z.number().optional(),
        color: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB unavailable");
        const { id, ...rest } = input;
        await db.update(ideas).set(rest).where(eq(ideas.id, id));
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB unavailable");
        await db.delete(ideas).where(eq(ideas.id, input.id));
        return { success: true };
      }),
    promote: protectedProcedure
      .input(z.object({
        ideaId: z.number(),
        projectId: z.number(),
        tasks: z.array(z.object({ title: z.string(), description: z.string().optional() })),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB unavailable");
        // Insert tasks
        for (const task of input.tasks) {
          await db.insert(ideaTasks).values({
            ideaId: input.ideaId,
            projectId: input.projectId,
            title: task.title,
            description: task.description ?? null,
          });
        }
        // Update idea status
        await db.update(ideas).set({ status: "promoted" }).where(eq(ideas.id, input.ideaId));
        // Log action
        await db.insert(actionsLog).values({
          projectId: input.projectId,
          actionType: "idea_promoted",
          title: `Idée promue en ${input.tasks.length} tâche(s)`,
          result: "success",
        });
        return { success: true };
      }),
    tasks: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        return db
          .select()
          .from(ideaTasks)
          .where(eq(ideaTasks.projectId, input.projectId))
          .orderBy(desc(ideaTasks.createdAt));
      }),
    updateTask: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["todo", "in_progress", "done"]),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB unavailable");
        await db.update(ideaTasks).set({ status: input.status }).where(eq(ideaTasks.id, input.id));
        return { success: true };
      }),
    seed: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB unavailable");
        // Vérifier si des idées existent déjà
        const existing = await db.select().from(ideas).where(eq(ideas.projectId, input.projectId)).limit(1);
        if (existing.length > 0) return { success: true, seeded: 0, message: "Des idées existent déjà" };
        // Fonctionnalités v1.3 de Ma Commune
        const seedIdeas = [
          // Accessibilité
          { title: "Accessibilité inclusive (RGAA)", description: "Conformité RGAA 4.1 : lecteurs d'écran, navigation clavier, contrastes, sous-titres vidéo", color: "#f87171", positionX: 50, positionY: 50, status: "promising" as const },
          // Signalements enrichis
          { title: "Commentaires enrichis", description: "Mentions @utilisateur, pièces jointes (photos, PDF), réactions emoji sur les signalements", color: "#fbbf24", positionX: 350, positionY: 50, status: "exploring" as const },
          { title: "Carte heatmap", description: "Visualisation de la densité des signalements par zone géographique sur la carte interactive", color: "#fb923c", positionX: 650, positionY: 50, status: "exploring" as const },
          // Tableau de bord citoyen
          { title: "Tableau de bord citoyen", description: "Suivi personnel des signalements : historique, statuts, notifications de résolution", color: "#60a5fa", positionX: 50, positionY: 220, status: "promising" as const },
          { title: "Notifications push", description: "Alertes en temps réel sur mobile quand un signalement change de statut", color: "#60a5fa", positionX: 350, positionY: 220, status: "exploring" as const },
          // Gamification
          { title: "Gamification citoyenne", description: "Badges et points de contribution : Citoyen actif, Signaleur du mois, Expert de quartier", color: "#34d399", positionX: 650, positionY: 220, status: "exploring" as const },
          { title: "Classement citoyens", description: "Leaderboard mensuel des citoyens les plus actifs dans chaque quartier", color: "#34d399", positionX: 950, positionY: 220, status: "exploring" as const },
          // App mobile
          { title: "App mobile React Native", description: "Application mobile cross-platform (iOS/Android) avec géolocalisation et photo directe", color: "#a78bfa", positionX: 50, positionY: 390, status: "promising" as const },
          { title: "Mode hors-ligne", description: "Saisie de signalements sans connexion, synchronisation automatique au retour du réseau", color: "#a78bfa", positionX: 350, positionY: 390, status: "exploring" as const },
          // Administration
          { title: "Tableau de bord admin avancé", description: "Statistiques détaillées : temps moyen de résolution, taux de satisfaction, évolution mensuelle", color: "#f472b6", positionX: 650, positionY: 390, status: "exploring" as const },
          { title: "Export données CSV/PDF", description: "Export des rapports d'incidents pour les réunions municipales et les comptes-rendus officiels", color: "#f472b6", positionX: 950, positionY: 390, status: "exploring" as const },
        ];
        let seeded = 0;
        for (const idea of seedIdeas) {
          await db.insert(ideas).values({ ...idea, projectId: input.projectId });
          seeded++;
        }
        return { success: true, seeded, message: `${seeded} idées v1.3 ajoutées` };
      }),
   }),

  // ── Paramètres PIPL (moteur IA, clés API) ──
  settings: router({
    get: protectedProcedure.query(async () => {
      const cfg = await getAiEngineConfig();
      return {
        engine: cfg.engine,
        openaiModel: cfg.openaiModel ?? "gpt-4o",
        // Ne jamais exposer la clé complète — masquée
        openaiKeyConfigured: !!(cfg.openaiApiKey && cfg.openaiApiKey.length > 10),
        openaiKeyPreview: cfg.openaiApiKey
          ? cfg.openaiApiKey.substring(0, 8) + "..." + cfg.openaiApiKey.slice(-4)
          : "",
      };
    }),

    update: protectedProcedure
      .input(
        z.object({
          engine: z.enum(["openai", "manus_forge"]).optional(),
          openaiApiKey: z.string().optional(),
          openaiModel: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        if (input.engine) await updateSetting("ai_engine", input.engine);
        if (input.openaiApiKey !== undefined) await updateSetting("openai_api_key", input.openaiApiKey);
        if (input.openaiModel) await updateSetting("openai_model", input.openaiModel);
        return { success: true };
      }),

    test: protectedProcedure.mutation(async () => {
      const cfg = await getAiEngineConfig();
      try {
        const res = await invokeLLMWithEngine({
          messages: [{ role: "user", content: "Réponds uniquement: OK" }],
          max_tokens: 10,
        }, cfg);
        const reply = res.choices[0]?.message?.content ?? "";
        return { success: true, engine: cfg.engine, reply };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, engine: cfg.engine, error: msg };
      }
    }),
  }),
  mobile: router({
    connectionCheck: protectedProcedure.query(async () => {
      const { getExpoStatus, getAppleStatus } = await import("./mobileIntegration");
      const [expo, apple] = await Promise.all([getExpoStatus(), getAppleStatus()]);
      return {
        expo: {
          connected: expo.connected,
          username: expo.username,
          email: expo.email,
          appName: expo.appName,
          appSlug: expo.appSlug,
          error: expo.error,
        },
        apple: {
          connected: apple.connected,
          appsCount: apple.apps.length,
          error: apple.error,
        },
      };
    }),
    expoStatus: protectedProcedure.query(async () => {
      const { getExpoStatus } = await import("./mobileIntegration");
      return getExpoStatus();
    }),
    appleStatus: protectedProcedure.query(async () => {
      const { getAppleStatus } = await import("./mobileIntegration");
      return getAppleStatus();
    }),
  }),
  // ── Proxy API Ma Commune (évite les problèmes CORS côté navigateur) ──────────
  maCommune: router({
    stats: protectedProcedure.query(async () => {
      const MC_API = "https://netetfix.com/mc-api";
      try {
        const [statsRes, incidentsRes] = await Promise.all([
          fetch(`${MC_API}/public/stats`, { headers: { Accept: "application/json" } }),
          fetch(`${MC_API}/public/incidents?limit=5`, { headers: { Accept: "application/json" } }),
        ]);
        if (!statsRes.ok) throw new Error(`Stats API HTTP ${statsRes.status}`);
        if (!incidentsRes.ok) throw new Error(`Incidents API HTTP ${incidentsRes.status}`);
        const statsJson = await statsRes.json();
        const incidentsJson = await incidentsRes.json();
        const statsData = statsJson.data ?? {};
        const incidentsList: any[] = incidentsJson.data?.data ?? [];
        return {
          success: true,
          total: statsData.total_incidents ?? 0,
          pending: statsData.submitted ?? 0,
          in_progress: statsData.in_progress ?? 0,
          resolved: statsData.resolved ?? 0,
          total_citizens: statsData.total_citizens ?? 0,
          resolution_rate: statsData.resolution_rate ?? null,
          top_categories: statsData.top_categories ?? [],
          recent: incidentsList.slice(0, 5).map((i: any) => ({
            id: i.id,
            title: i.title ?? i.description?.slice(0, 60) ?? "Signalement",
            status: i.status,
            category_name: i.category_name ?? i.category?.name ?? "—",
            created_at: i.created_at,
            commune: i.commune ?? null,
          })),
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: msg,
          total: 0, pending: 0, in_progress: 0, resolved: 0,
          total_citizens: 0, resolution_rate: null, top_categories: [], recent: [],
        };
      }
    }),
  }),
});
export type AppRouter = typeof appRouter;
