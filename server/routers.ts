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
        localPath: z.string(),
      }))
      .mutation(async ({ input }) => {
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `Tu es un expert en analyse d'interfaces utilisateur. Analyse le screenshot fourni et identifie tous les éléments interactifs visibles (boutons, liens, champs de saisie, menus, onglets, etc.). Pour chaque élément, fournis ses coordonnées relatives (en pourcentage de la largeur/hauteur de l'image), son texte ou label, et son type. Réponds UNIQUEMENT en JSON valide.`,
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
                  text: "Identifie tous les éléments interactifs de cette interface. Retourne un JSON avec la structure: { elements: [{ id: string, type: 'button'|'link'|'input'|'menu'|'tab'|'other', label: string, x: number, y: number, width: number, height: number }] } où x,y,width,height sont des pourcentages (0-100).",
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
                      },
                      required: ["id", "type", "label", "x", "y", "width", "height"],
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
        return parsed as { elements: Array<{ id: string; type: string; label: string; x: number; y: number; width: number; height: number }> };
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
        });
        return { success: true, id: Number((result as any).insertId) };
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        description: z.string().optional(),
        status: z.enum(["exploring", "promising", "in_progress", "promoted", "abandoned"]).optional(),
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
  }),
});

export type AppRouter = typeof appRouter;
