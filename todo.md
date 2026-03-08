# PIPL — Todo

## Schéma & Infrastructure
- [x] Tables DB : projects, actions_log, architecture_decisions, ideas, idea_tasks, analysis_cache
- [x] Migrations Drizzle appliquées

## Design System & Layout
- [x] Design system sombre (dark theme, couleurs accent bleu/violet)
- [x] DashboardLayout avec sidebar navigation (PiplLayout)
- [x] Routes App.tsx : Dashboard, Config, Carte, Journal, ADR, UI-Code, Idées

## Tableau de Bord
- [x] KPI cards (phases, avancement, commits, décisions)
- [x] Activité récente (flux actions_log)
- [x] Statut environnements locaux

## Configuration
- [x] Formulaire chemin projet local
- [x] Sauvegarde en DB (table projects)
- [x] Sélection projet actif

## Cartographie d'Architecture
- [x] Installation @xyflow/react
- [x] Procédure tRPC analyzeProject (analyse AST TypeScript)
- [x] Détection routes tRPC/Express backend
- [x] Détection appels frontend
- [x] Détection schémas Drizzle/DB
- [x] Visualisation React Flow avec nœuds colorés
- [x] Panneau latéral au clic sur un nœud

## Journal d'Actions Git
- [x] Installation chokidar + simple-git
- [x] Service de surveillance .git/logs/HEAD
- [x] Enregistrement commits en DB (actions_log)
- [x] Interface journal avec filtres et timeline

## ADR (Architecture Decision Records)
- [x] Formulaire de saisie ADR
- [x] Liste des ADR avec statuts (proposed, accepted, deprecated, superseded)
- [x] Compteurs par statut

## Pont UI-Code Visuel
- [x] Upload screenshot (côté client, base64)
- [x] Procédure tRPC analyzeScreenshot (LLM Vision GPT-4o)
- [x] Superposition zones cliquables sur l'image
- [x] Recherche textuelle dans code source
- [x] Panneau résultat avec snippet de code et contexte

## Arbre des Idées
- [x] @xyflow/react en mode mind-map
- [x] Tables ideas + idea_tasks en DB
- [x] CRUD idées via tRPC
- [x] Visualisation mind-map interactive avec drag & drop
- [x] Bouton "Promouvoir en Tâches" avec formulaire
- [x] Panneau de gestion des tâches (todo/in_progress/done)

## Tests & Livraison
- [x] Tests vitest pour les procédures principales (13 tests passés)
- [x] Checkpoint final

## Améliorations v1.1
- [x] Surveillance Git en temps réel (Chokidar watcher + polling serveur)
- [x] Endpoint SSE /api/git-events pour push vers le frontend
- [x] Auto-refresh Journal quand un nouveau commit est détecté
- [x] Export rapport PDF (architecture + ADR + journal)
- [x] Procédure tRPC generateReport
- [x] Page/bouton "Exporter PDF" sur le tableau de bord
- [x] Liaison ADR ↔ nœuds d'architecture (champ nodeId sur ADR)
- [x] UI pour attacher un ADR à un nœud depuis la carte
- [x] Affichage des ADR liées dans le panneau latéral d'un nœud
