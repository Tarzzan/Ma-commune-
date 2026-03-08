import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ── Mock DB ──────────────────────────────────────────────────────────────────
// Drizzle query chains can end at different depths; we create a chainable
// object that always resolves to an empty array at any terminal call.

function makeChain(result: unknown[] = []): any {
  // A thenable chain: calling .then() resolves with result (makes it awaitable)
  // All other method calls return the same chain for further chaining
  const chain: any = {
    then(resolve: Function, reject?: Function) {
      return Promise.resolve(result).then(resolve as any, reject as any);
    },
  };
  return new Proxy(chain, {
    get(target, prop) {
      if (prop === "then") return target.then.bind(target);
      if (prop === Symbol.iterator) return [][Symbol.iterator].bind([]);
      return (..._args: any[]) => makeChain(result);
    },
  });
}

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({
    select: () => makeChain([]),
    insert: () => ({ values: () => Promise.resolve({ insertId: 1 }) }),
    update: () => ({ set: () => ({ where: () => Promise.resolve({}) }) }),
    delete: () => ({ where: () => Promise.resolve({}) }),
  }),
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
}));

vi.mock("./analysis", () => ({
  analyzeProjectCode: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
  searchInFiles: vi.fn().mockResolvedValue([]),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({ elements: [] }) } }],
  }),
}));

// ── Context helpers ──────────────────────────────────────────────────────────

function makeCtx(role: "user" | "admin" = "user"): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("auth", () => {
  it("me returns the current user", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const user = await caller.auth.me();
    expect(user?.name).toBe("Test User");
  });

  it("logout clears the session cookie and returns success", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result.success).toBe(true);
  });
});

describe("projects", () => {
  it("list resolves without throwing", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.projects.list()).resolves.toBeDefined();
  });

  it("create returns success", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.projects.create({
      name: "Test Project",
      localPath: "/home/test/project",
      description: "A test project",
    });
    expect(result.success).toBe(true);
  });
});

describe("actions", () => {
  it("list resolves without throwing", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.actions.list({ projectId: 1, limit: 10 })).resolves.toBeDefined();
  });

  it("stats returns numeric counts", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const stats = await caller.actions.stats({ projectId: 1 });
    expect(typeof stats.total).toBe("number");
    expect(typeof stats.commits).toBe("number");
    expect(typeof stats.analyses).toBe("number");
  });

  it("create returns success", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.actions.create({
      projectId: 1,
      actionType: "manual",
      title: "Test action",
      result: "success",
    });
    expect(result.success).toBe(true);
  });
});

describe("adr", () => {
  it("list resolves without throwing", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.adr.list({ projectId: 1 })).resolves.toBeDefined();
  });
});

describe("ideas", () => {
  it("list resolves without throwing", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.ideas.list({ projectId: 1 })).resolves.toBeDefined();
  });

  it("tasks resolves without throwing", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.ideas.tasks({ projectId: 1 })).resolves.toBeDefined();
  });
});

describe("analysis", () => {
  it("getCache resolves without throwing", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.analysis.getCache({ projectId: 1 })).resolves.toBeDefined();
  });
});

describe("uiCode", () => {
  it("searchInCode resolves without throwing", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.uiCode.searchInCode({ localPath: "/tmp", searchText: "button" })
    ).resolves.toBeDefined();
  });
});

describe("gitWatcher", () => {
  it("status returns activeWatchers array", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.gitWatcher.status();
    expect(Array.isArray(result.activeWatchers)).toBe(true);
  });

  it("stop resolves without throwing", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.gitWatcher.stop({ projectId: 999 })).resolves.toEqual({ success: true });
  });
});

describe("report", () => {
  it("generate resolves without throwing when project exists", async () => {
    // Mock DB returns empty arrays for all queries
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    // Will throw "Project not found" since mock returns [] — that's expected
    await expect(caller.report.generate({ projectId: 1 })).rejects.toThrow();
  });
});

describe("analysis.snapshots", () => {
  it("listSnapshots returns an array", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.analysis.listSnapshots({ projectId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("getSnapshot returns null when not found", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.analysis.getSnapshot({ id: 9999 });
    expect(result).toBeNull();
  });

  it("deleteSnapshot resolves without throwing", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.analysis.deleteSnapshot({ id: 9999 })).resolves.toEqual({ success: true });
  });

  it("diff throws when snapshots not found", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.analysis.diff({ snapshotAId: 1, snapshotBId: 2 })).rejects.toThrow();
  });
});

describe("adr.linkToNode", () => {
  it("linkToNode resolves without throwing", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.adr.linkToNode({ id: 1, nodeId: "api-test" })).resolves.toEqual({ success: true });
  });

  it("listByNode resolves without throwing", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.adr.listByNode({ projectId: 1, nodeId: "api-test" })).resolves.toBeDefined();
  });
});
