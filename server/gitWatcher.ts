/**
 * gitWatcher.ts
 * Surveille le fichier .git/COMMIT_EDITMSG d'un projet local avec Chokidar.
 * Quand un nouveau commit est détecté, il est enregistré en DB (actions_log)
 * et un événement est émis vers tous les clients SSE connectés.
 */

import chokidar, { FSWatcher } from "chokidar";
import simpleGit from "simple-git";
import type { Response } from "express";
import { getDb } from "./db";
import { actionsLog } from "../drizzle/schema";

// ── SSE client registry ──────────────────────────────────────────────────────

interface SseClient {
  projectId: number;
  res: Response;
}

const sseClients: Set<SseClient> = new Set();

export function addSseClient(projectId: number, res: Response): () => void {
  const client: SseClient = { projectId, res };
  sseClients.add(client);
  return () => sseClients.delete(client);
}

function broadcastToProject(projectId: number, data: object) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of Array.from(sseClients)) {
    if (client.projectId === projectId) {
      try {
        client.res.write(payload);
      } catch {
        sseClients.delete(client);
      }
    }
  }
}

// ── Watcher registry ─────────────────────────────────────────────────────────

interface WatcherEntry {
  watcher: FSWatcher;
  localPath: string;
  lastHash: string;
}

const watchers = new Map<number, WatcherEntry>();

async function getLastCommitHash(localPath: string): Promise<string | null> {
  try {
    const git = simpleGit(localPath);
    const log = await git.log({ maxCount: 1 });
    return log.latest?.hash ?? null;
  } catch {
    return null;
  }
}

async function recordCommit(projectId: number, localPath: string) {
  try {
    const git = simpleGit(localPath);
    const log = await git.log({ maxCount: 1 });
    const latest = log.latest;
    if (!latest) return;

    const db = await getDb();
    if (!db) return;

    const title = latest.message.trim().slice(0, 200);
    await db.insert(actionsLog).values({
      projectId,
      actionType: "git_commit",
      title,
      author: latest.author_name,
      hash: latest.hash,
      branch: await git.revparse(["--abbrev-ref", "HEAD"]).catch(() => "unknown"),
      result: "success",
    });

    broadcastToProject(projectId, {
      type: "git_commit",
      commit: {
        hash: latest.hash,
        message: latest.message,
        author: latest.author_name,
        date: latest.date,
      },
    });

    console.log(`[GitWatcher] New commit recorded for project ${projectId}: ${latest.hash.slice(0, 7)}`);
  } catch (err) {
    console.warn(`[GitWatcher] Failed to record commit for project ${projectId}:`, err);
  }
}

export async function startWatcher(projectId: number, localPath: string) {
  // Stop existing watcher for this project if any
  stopWatcher(projectId);

  const commitMsgPath = `${localPath}/.git/COMMIT_EDITMSG`;
  const headPath = `${localPath}/.git/logs/HEAD`;

  // Check if .git exists
  const fs = await import("fs");
  if (!fs.existsSync(`${localPath}/.git`)) {
    console.warn(`[GitWatcher] No .git directory found at ${localPath}`);
    return;
  }

  const lastHash = await getLastCommitHash(localPath);

  const watcher = chokidar.watch([commitMsgPath, headPath], {
    persistent: true,
    ignoreInitial: true,
    usePolling: false,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  });

  watcher.on("change", async () => {
    const currentHash = await getLastCommitHash(localPath);
    const entry = watchers.get(projectId);
    if (currentHash && currentHash !== entry?.lastHash) {
      if (entry) entry.lastHash = currentHash;
      await recordCommit(projectId, localPath);
    }
  });

  watcher.on("error", (err) => {
    console.warn(`[GitWatcher] Watcher error for project ${projectId}:`, err);
  });

  watchers.set(projectId, { watcher, localPath, lastHash: lastHash ?? "" });
  console.log(`[GitWatcher] Started watching ${localPath} for project ${projectId}`);
}

export function stopWatcher(projectId: number) {
  const entry = watchers.get(projectId);
  if (entry) {
    entry.watcher.close();
    watchers.delete(projectId);
    console.log(`[GitWatcher] Stopped watcher for project ${projectId}`);
  }
}

export function stopAllWatchers() {
  for (const [projectId] of Array.from(watchers)) {
    stopWatcher(projectId);
  }
}

export function getActiveWatchers(): number[] {
  return Array.from(watchers.keys());
}
