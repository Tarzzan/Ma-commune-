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
} from "../drizzle/schema";
import { eq, desc, and } from "drizzle-orm";
import { analyzeProjectCode } from "./analysis";
import { invokeLLM } from "./_core/llm";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
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
        await db.insert(projects).values({
          name: input.name,
          localPath: input.localPath,
          description: input.description ?? null,
        });
        return { success: true };
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
  }),

  // ── Architecture Analysis ──
  analysis: router({
    analyze: protectedProcedure
      .input(z.object({ projectId: z.number(), localPath: z.string() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB unavailable");
        const result = await analyzeProjectCode(input.localPath);
        // Cache result
        await db.delete(analysisCache).where(eq(analysisCache.projectId, input.projectId));
        await db.insert(analysisCache).values({
          projectId: input.projectId,
          nodes: result.nodes as any,
          edges: result.edges as any,
        });
        // Update project lastAnalyzedAt
        await db
          .update(projects)
          .set({ lastAnalyzedAt: new Date() })
          .where(eq(projects.id, input.projectId));
        // Log action
        await db.insert(actionsLog).values({
          projectId: input.projectId,
          actionType: "analysis",
          title: `Analyse d'architecture effectuée`,
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
