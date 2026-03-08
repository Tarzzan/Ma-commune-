import * as fs from "fs";
import * as path from "path";

export interface ArchNode {
  id: string;
  type: "api" | "frontend" | "db" | "service" | "router";
  label: string;
  file?: string;
  line?: number;
  data?: Record<string, unknown>;
}

export interface ArchEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface AnalysisResult {
  nodes: ArchNode[];
  edges: ArchEdge[];
}

export interface CodeMatch {
  file: string;
  line: number;
  content: string;
  context: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function walkDir(dir: string, exts: string[], ignore: string[]): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (ignore.some(ig => entry.name === ig || full.includes(ig))) continue;
    if (entry.isDirectory()) {
      results.push(...walkDir(full, exts, ignore));
    } else if (exts.some(ext => entry.name.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

function readSafe(filePath: string): string {
  try { return fs.readFileSync(filePath, "utf-8"); }
  catch { return ""; }
}

// ── Analyseurs ───────────────────────────────────────────────────────────────

function detectTrpcRouters(files: string[], basePath: string): { nodes: ArchNode[]; edges: ArchEdge[] } {
  const nodes: ArchNode[] = [];
  const edges: ArchEdge[] = [];

  for (const file of files) {
    if (!file.includes("router") && !file.includes("routers")) continue;
    const content = readSafe(file);
    const relFile = path.relative(basePath, file);

    // Detect router definitions: router({ ... })
    const routerMatch = content.match(/export\s+const\s+(\w+Router|\w+)\s*=\s*router\(/g);
    if (routerMatch) {
      const routerName = (content.match(/export\s+const\s+(\w+)\s*=\s*router\(/) ?? [])[1];
      if (routerName) {
        const nodeId = `router_${routerName}`;
        nodes.push({ id: nodeId, type: "router", label: routerName, file: relFile });
      }
    }

    // Detect procedures: .query / .mutation
    const procedureRegex = /(\w+)\s*:\s*(?:protected|public)?Procedure(?:\.[^,{]+)?\.(?:query|mutation)/g;
    let match;
    while ((match = procedureRegex.exec(content)) !== null) {
      const procName = match[1];
      const nodeId = `api_${procName}_${file.replace(/[^a-z0-9]/gi, "_")}`;
      nodes.push({ id: nodeId, type: "api", label: procName, file: relFile });
    }
  }
  return { nodes, edges };
}

function detectDrizzleSchemas(files: string[], basePath: string): { nodes: ArchNode[]; edges: ArchEdge[] } {
  const nodes: ArchNode[] = [];
  const edges: ArchEdge[] = [];

  for (const file of files) {
    if (!file.includes("schema")) continue;
    const content = readSafe(file);
    const relFile = path.relative(basePath, file);

    // Detect table definitions
    const tableRegex = /export\s+const\s+(\w+)\s*=\s*(?:mysqlTable|pgTable|sqliteTable)\s*\(\s*["'](\w+)["']/g;
    let match;
    while ((match = tableRegex.exec(content)) !== null) {
      const [, varName, tableName] = match;
      const nodeId = `db_${tableName}`;
      nodes.push({ id: nodeId, type: "db", label: tableName, file: relFile, data: { varName } });
    }
  }
  return { nodes, edges };
}

function detectFrontendComponents(files: string[], basePath: string): { nodes: ArchNode[]; edges: ArchEdge[] } {
  const nodes: ArchNode[] = [];
  const edges: ArchEdge[] = [];

  for (const file of files) {
    if (!file.includes("/pages/") && !file.includes("/components/")) continue;
    const content = readSafe(file);
    const relFile = path.relative(basePath, file);

    // Detect React components (default export or named export)
    const compMatch = content.match(/export\s+default\s+function\s+(\w+)|export\s+function\s+(\w+)/);
    if (compMatch) {
      const compName = compMatch[1] ?? compMatch[2];
      if (compName) {
        const nodeId = `fe_${compName}`;
        nodes.push({ id: nodeId, type: "frontend", label: compName, file: relFile });

        // Detect tRPC calls in this component
        const trpcCallRegex = /trpc\.(\w+)\.(\w+)\.use(?:Query|Mutation)/g;
        let match;
        while ((match = trpcCallRegex.exec(content)) !== null) {
          const [, routerName, procName] = match;
          const targetId = `api_${procName}`;
          edges.push({
            id: `edge_${nodeId}_${targetId}`,
            source: nodeId,
            target: targetId,
            label: `${routerName}.${procName}`,
          });
        }
      }
    }
  }
  return { nodes, edges };
}

function detectServices(files: string[], basePath: string): { nodes: ArchNode[]; edges: ArchEdge[] } {
  const nodes: ArchNode[] = [];
  const edges: ArchEdge[] = [];

  for (const file of files) {
    if (!file.includes("/server/") || file.includes("router") || file.includes("schema")) continue;
    const content = readSafe(file);
    const relFile = path.relative(basePath, file);

    const exportMatch = content.match(/export\s+(?:async\s+)?function\s+(\w+)/g);
    if (exportMatch && exportMatch.length > 0) {
      const funcName = (exportMatch[0].match(/function\s+(\w+)/) ?? [])[1];
      if (funcName) {
        const nodeId = `svc_${funcName}`;
        nodes.push({ id: nodeId, type: "service", label: funcName, file: relFile });
      }
    }
  }
  return { nodes, edges };
}

function buildEdgesFromNodes(nodes: ArchNode[]): ArchEdge[] {
  const edges: ArchEdge[] = [];
  const apiNodes = nodes.filter(n => n.type === "api");
  const dbNodes = nodes.filter(n => n.type === "db");
  const routerNodes = nodes.filter(n => n.type === "router");
  const feNodes = nodes.filter(n => n.type === "frontend");

  // Router → API (same file)
  for (const router of routerNodes) {
    for (const api of apiNodes) {
      if (router.file === api.file) {
        edges.push({ id: `e_${router.id}_${api.id}`, source: router.id, target: api.id });
      }
    }
  }

  // API → DB (heuristic: if api label contains db table name)
  for (const api of apiNodes) {
    for (const db of dbNodes) {
      if (api.label.toLowerCase().includes(db.label.toLowerCase().slice(0, 4))) {
        edges.push({ id: `e_${api.id}_${db.id}`, source: api.id, target: db.id, label: "query" });
      }
    }
  }

  return edges;
}

// ── Layout ───────────────────────────────────────────────────────────────────

function assignPositions(nodes: ArchNode[]): ArchNode[] {
  const typeOrder: Record<string, number> = { frontend: 0, router: 1, api: 2, service: 3, db: 4 };
  const byType: Record<string, ArchNode[]> = {};
  for (const node of nodes) {
    if (!byType[node.type]) byType[node.type] = [];
    byType[node.type].push(node);
  }

  const positioned: ArchNode[] = [];
  const colWidth = 280;
  const rowHeight = 100;

  for (const [type, typeNodes] of Object.entries(byType)) {
    const col = typeOrder[type] ?? 2;
    typeNodes.forEach((node, i) => {
      positioned.push({
        ...node,
        data: {
          ...node.data,
          position: { x: col * colWidth, y: i * rowHeight },
        },
      });
    });
  }
  return positioned;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function analyzeProjectCode(localPath: string): Promise<AnalysisResult> {
  const ignore = ["node_modules", ".git", "dist", "build", ".next", "coverage", ".turbo"];
  const exts = [".ts", ".tsx", ".js", ".jsx"];

  const files = walkDir(localPath, exts, ignore);

  const { nodes: routerNodes, edges: routerEdges } = detectTrpcRouters(files, localPath);
  const { nodes: dbNodes, edges: dbEdges } = detectDrizzleSchemas(files, localPath);
  const { nodes: feNodes, edges: feEdges } = detectFrontendComponents(files, localPath);
  const { nodes: svcNodes, edges: svcEdges } = detectServices(files, localPath);

  const allNodes = assignPositions([...routerNodes, ...dbNodes, ...feNodes, ...svcNodes]);
  const derivedEdges = buildEdgesFromNodes(allNodes);
  const allEdges = [...routerEdges, ...dbEdges, ...feEdges, ...svcEdges, ...derivedEdges];

  // Deduplicate edges
  const seen = new Set<string>();
  const uniqueEdges = allEdges.filter(e => {
    const key = `${e.source}->${e.target}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { nodes: allNodes, edges: uniqueEdges };
}

export async function searchInFiles(localPath: string, searchText: string): Promise<CodeMatch[]> {
  const ignore = ["node_modules", ".git", "dist", "build"];
  const exts = [".ts", ".tsx", ".js", ".jsx", ".html", ".css"];
  const files = walkDir(localPath, exts, ignore);
  const results: CodeMatch[] = [];
  const lowerSearch = searchText.toLowerCase();

  for (const file of files) {
    const content = readSafe(file);
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(lowerSearch)) {
        results.push({
          file: path.relative(localPath, file),
          line: i + 1,
          content: lines[i].trim(),
          context: lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 3)).map(l => l.trim()),
        });
        if (results.length >= 20) return results;
      }
    }
  }
  return results;
}
