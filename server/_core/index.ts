import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { addSseClient, startWatcher, stopAllWatchers } from "../gitWatcher";
import { getDb } from "../db";
import { projects, users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // ── SSE endpoint for Git events ──
  app.get("/api/git-events/:projectId", (req, res) => {
    const projectId = parseInt(req.params.projectId);
    if (isNaN(projectId)) {
      res.status(400).json({ error: "Invalid projectId" });
      return;
    }
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    // Send initial heartbeat
    res.write("data: {\"type\":\"connected\"}\n\n");
    // Keep-alive ping every 25s
    const ping = setInterval(() => {
      try { res.write("data: {\"type\":\"ping\"}\n\n"); } catch { clearInterval(ping); }
    }, 25000);
    const cleanup = addSseClient(projectId, res);
    req.on("close", () => { clearInterval(ping); cleanup(); });
  });

  // ── Endpoint public : vérifier si un admin existe (sans session) ──
  app.get("/api/has-admin", async (_req, res) => {
    try {
      const db = await getDb();
      if (!db) { res.json({ hasAdmin: false }); return; }
      const rows = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
      res.json({ hasAdmin: rows.length > 0 });
    } catch {
      res.json({ hasAdmin: false });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || "3000");

  server.listen(port, async () => {
    console.log(`Server running on http://localhost:${port}/`);
    // Auto-start Git watchers for all configured projects
    try {
      const db = await getDb();
      if (db) {
        const allProjects = await db.select().from(projects);
        for (const project of allProjects) {
          if (project.localPath) {
            startWatcher(project.id, project.localPath).catch(() => {});
          }
        }
        if (allProjects.length > 0) {
          console.log(`[GitWatcher] Auto-started watchers for ${allProjects.length} project(s)`);
        }
      }
    } catch (err) {
      console.warn("[GitWatcher] Could not auto-start watchers:", err);
    }
  });

  // Graceful shutdown
  process.on("SIGTERM", () => { stopAllWatchers(); process.exit(0); });
  process.on("SIGINT", () => { stopAllWatchers(); process.exit(0); });
}

startServer().catch(console.error);
