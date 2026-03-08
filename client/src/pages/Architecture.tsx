import { trpc } from "@/lib/trpc";
import { useState, useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  type Node,
  type Edge,
  type NodeMouseHandler,
  MarkerType,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Cpu,
  Database,
  Globe,
  Layers,
  RefreshCw,
  X,
  FileCode,
  Server,
  Shield,
  Link2,
  Link2Off,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NODE_TYPE_CONFIG: Record<string, { color: string; bg: string; border: string; icon: React.ElementType; label: string }> = {
  api: { color: "#60a5fa", bg: "rgba(96,165,250,0.1)", border: "rgba(96,165,250,0.4)", icon: Server, label: "API / Procédure" },
  db: { color: "#34d399", bg: "rgba(52,211,153,0.1)", border: "rgba(52,211,153,0.4)", icon: Database, label: "Table DB" },
  frontend: { color: "#a78bfa", bg: "rgba(167,139,250,0.1)", border: "rgba(167,139,250,0.4)", icon: Globe, label: "Composant Frontend" },
  service: { color: "#fbbf24", bg: "rgba(251,191,36,0.1)", border: "rgba(251,191,36,0.4)", icon: Layers, label: "Service" },
  router: { color: "#60a5fa", bg: "rgba(96,165,250,0.08)", border: "rgba(96,165,250,0.3)", icon: Cpu, label: "Routeur" },
};

const STATUS_COLORS: Record<string, string> = {
  proposed: "text-blue-400",
  accepted: "text-green-400",
  deprecated: "text-red-400",
  superseded: "text-slate-400",
};

const STATUS_LABELS: Record<string, string> = {
  proposed: "Proposée",
  accepted: "Acceptée",
  deprecated: "Dépréciée",
  superseded: "Remplacée",
};

function ArchNode({ data }: { data: any }) {
  const config = NODE_TYPE_CONFIG[data.type] ?? NODE_TYPE_CONFIG.api;
  const Icon = config.icon;
  return (
    <div
      className="rounded-lg border px-3 py-2 min-w-[140px] cursor-pointer transition-all hover:scale-105"
      style={{ background: config.bg, borderColor: data.hasLinkedAdr ? config.color : config.border, boxShadow: data.hasLinkedAdr ? `0 0 8px ${config.color}55` : undefined }}
    >
      <div className="flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: config.color }} />
        <span className="text-xs font-semibold truncate" style={{ color: config.color }}>
          {data.label}
        </span>
        {data.hasLinkedAdr && <Shield className="w-2.5 h-2.5 text-yellow-400 shrink-0" />}
      </div>
      {data.file && (
        <p className="text-[10px] text-slate-500 mt-0.5 font-mono truncate">{data.file}</p>
      )}
    </div>
  );
}

const nodeTypes = { archNode: ArchNode };

interface DetailNode {
  id: string;
  type: string;
  label: string;
  file?: string;
  line?: number;
  data?: Record<string, unknown>;
}

function DetailPanel({
  node,
  projectId,
  allAdrs,
  onClose,
}: {
  node: DetailNode;
  projectId: number;
  allAdrs: any[];
  onClose: () => void;
}) {
  const config = NODE_TYPE_CONFIG[node.type] ?? NODE_TYPE_CONFIG.api;
  const Icon = config.icon;
  const utils = trpc.useUtils();

  const { data: linkedAdrs = [] } = trpc.adr.listByNode.useQuery({
    projectId,
    nodeId: node.id,
  });

  const linkToNode = trpc.adr.linkToNode.useMutation({
    onSuccess: () => {
      toast.success("ADR liée au nœud !");
      utils.adr.listByNode.invalidate();
      utils.adr.list.invalidate();
    },
    onError: (e) => toast.error(`Erreur : ${e.message}`),
  });

  const unlinkFromNode = trpc.adr.linkToNode.useMutation({
    onSuccess: () => {
      toast.success("Liaison supprimée");
      utils.adr.listByNode.invalidate();
    },
  });

  // ADRs not yet linked to this node
  const linkedIds = new Set(linkedAdrs.map((a: any) => a.id));
  const availableAdrs = allAdrs.filter((a) => !linkedIds.has(a.id));

  const [selectedAdrId, setSelectedAdrId] = useState<string>("");

  const handleLink = () => {
    if (!selectedAdrId) return;
    linkToNode.mutate({ id: parseInt(selectedAdrId), nodeId: node.id });
    setSelectedAdrId("");
  };

  return (
    <div className="absolute right-0 top-0 h-full w-80 bg-card border-l border-border z-10 flex flex-col slide-in-right">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4" style={{ color: config.color }} />
          <span className="font-semibold text-sm truncate">{node.label}</span>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Type */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Type</p>
          <span
            className="text-xs px-2 py-1 rounded-full font-medium"
            style={{ background: config.bg, color: config.color, border: `1px solid ${config.border}` }}
          >
            {config.label}
          </span>
        </div>

        {/* Source file */}
        {node.file && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Fichier source</p>
            <div className="flex items-center gap-2 bg-secondary/50 rounded-lg px-3 py-2">
              <FileCode className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs font-mono text-foreground break-all">{node.file}</span>
            </div>
            {node.line && (
              <p className="text-xs text-muted-foreground mt-1">Ligne {node.line}</p>
            )}
          </div>
        )}

        {/* Node ID */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Identifiant</p>
          <code className="text-xs bg-secondary/50 px-2 py-1 rounded font-mono break-all">{node.id}</code>
        </div>

        {/* Linked ADRs */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Shield className="w-3 h-3 text-yellow-400" />
            Décisions liées ({linkedAdrs.length})
          </p>
          {linkedAdrs.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Aucune décision ADR liée à ce nœud.</p>
          ) : (
            <div className="space-y-2">
              {linkedAdrs.map((adr: any) => (
                <div key={adr.id} className="bg-secondary/40 rounded-lg p-2.5 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono text-muted-foreground">{adr.adrId}</p>
                      <p className="text-xs font-semibold truncate">{adr.title}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className={cn("text-[10px]", STATUS_COLORS[adr.status])}>
                        {STATUS_LABELS[adr.status]}
                      </span>
                      <button
                        onClick={() => unlinkFromNode.mutate({ id: adr.id, nodeId: null })}
                        className="text-muted-foreground hover:text-red-400 transition-colors ml-1"
                        title="Délier"
                      >
                        <Link2Off className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  {adr.decision && (
                    <p className="text-[10px] text-muted-foreground line-clamp-2">{adr.decision}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Link an ADR */}
        {availableAdrs.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Link2 className="w-3 h-3 text-cyan-400" />
              Attacher une décision
            </p>
            <div className="flex gap-2">
              <Select value={selectedAdrId} onValueChange={setSelectedAdrId}>
                <SelectTrigger className="flex-1 h-8 text-xs">
                  <SelectValue placeholder="Choisir un ADR…" />
                </SelectTrigger>
                <SelectContent>
                  {availableAdrs.map((adr: any) => (
                    <SelectItem key={adr.id} value={String(adr.id)}>
                      <span className="font-mono text-xs text-muted-foreground mr-2">{adr.adrId}</span>
                      <span className="text-xs truncate">{adr.title}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="h-8 px-2"
                onClick={handleLink}
                disabled={!selectedAdrId || linkToNode.isPending}
              >
                <Link2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Architecture() {
  const { data: projectList = [] } = trpc.projects.list.useQuery();
  const activeProject = projectList[0];
  const [selectedNode, setSelectedNode] = useState<DetailNode | null>(null);
  const utils = trpc.useUtils();

  const { data: cache, isLoading: cacheLoading } = trpc.analysis.getCache.useQuery(
    { projectId: activeProject?.id ?? 0 },
    { enabled: !!activeProject }
  );

  const { data: allAdrs = [] } = trpc.adr.list.useQuery(
    { projectId: activeProject?.id ?? 0 },
    { enabled: !!activeProject }
  );

  const analyze = trpc.analysis.analyze.useMutation({
    onSuccess: () => {
      toast.success("Analyse terminée !");
      utils.analysis.getCache.invalidate();
      utils.projects.list.invalidate();
    },
    onError: (e) => toast.error(`Erreur d'analyse : ${e.message}`),
  });

  const rawNodes: any[] = Array.isArray(cache?.nodes) ? (cache.nodes as any[]) : [];
  const rawEdges: any[] = Array.isArray(cache?.edges) ? (cache.edges as any[]) : [];

  // Build a set of nodeIds that have linked ADRs
  const linkedNodeIds = useMemo(() => {
    const ids = new Set<string>();
    allAdrs.forEach((adr: any) => { if (adr.linkedNodeId) ids.add(adr.linkedNodeId); });
    return ids;
  }, [allAdrs]);

  const flowNodes: Node[] = useMemo(() =>
    rawNodes.map((n, i) => ({
      id: n.id,
      type: "archNode",
      position: n.data?.position ?? { x: (i % 5) * 220, y: Math.floor(i / 5) * 120 },
      data: {
        label: n.label,
        type: n.type,
        file: n.file,
        line: n.line,
        hasLinkedAdr: linkedNodeIds.has(n.id),
        ...n.data,
      },
    })),
    [rawNodes, linkedNodeIds]
  );

  const flowEdges: Edge[] = useMemo(() =>
    rawEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      animated: e.label?.includes("query"),
      style: { stroke: "rgba(148,163,184,0.4)", strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(148,163,184,0.4)" },
      labelStyle: { fill: "#94a3b8", fontSize: 10 },
      labelBgStyle: { fill: "rgba(15,23,42,0.8)" },
    })),
    [rawEdges]
  );

  const onNodeClick: NodeMouseHandler = useCallback((_evt, node) => {
    setSelectedNode({
      id: node.id,
      type: node.data.type as string,
      label: node.data.label as string,
      file: node.data.file as string | undefined,
      line: node.data.line as number | undefined,
    });
  }, []);

  if (!activeProject) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground text-sm">Configurez un projet d'abord.</p>
      </div>
    );
  }

  const typeCounts = rawNodes.reduce((acc: Record<string, number>, n) => {
    acc[n.type] = (acc[n.type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Cpu className="w-5 h-5 text-violet-400" />
            Cartographie d'Architecture
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {rawNodes.length} nœuds · {rawEdges.length} liaisons
            {linkedNodeIds.size > 0 && (
              <span className="ml-2 text-yellow-400">
                · <Shield className="w-3 h-3 inline" /> {linkedNodeIds.size} nœud(s) avec ADR
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Legend */}
          <div className="hidden md:flex items-center gap-3">
            {Object.entries(NODE_TYPE_CONFIG).filter(([k]) => typeCounts[k]).map(([type, cfg]) => (
              <div key={type} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ background: cfg.color }} />
                <span className="text-xs text-muted-foreground">{cfg.label}</span>
                <span className="text-xs font-semibold">{typeCounts[type]}</span>
              </div>
            ))}
          </div>
          <Button
            size="sm"
            onClick={() => analyze.mutate({ projectId: activeProject.id, localPath: activeProject.localPath })}
            disabled={analyze.isPending}
          >
            <RefreshCw className={cn("w-4 h-4 mr-2", analyze.isPending && "animate-spin")} />
            {analyze.isPending ? "Analyse…" : "Analyser"}
          </Button>
        </div>
      </div>

      {/* Flow canvas */}
      <div className="flex-1 relative">
        {rawNodes.length === 0 && !cacheLoading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-violet-400/10 border border-violet-400/20 flex items-center justify-center">
              <Cpu className="w-8 h-8 text-violet-400" />
            </div>
            <div className="text-center">
              <p className="font-semibold mb-1">Aucune analyse disponible</p>
              <p className="text-sm text-muted-foreground">
                Cliquez sur "Analyser" pour scanner le code source de{" "}
                <span className="font-mono text-xs">{activeProject.localPath}</span>
              </p>
            </div>
            <Button
              onClick={() => analyze.mutate({ projectId: activeProject.id, localPath: activeProject.localPath })}
              disabled={analyze.isPending}
            >
              <RefreshCw className={cn("w-4 h-4 mr-2", analyze.isPending && "animate-spin")} />
              Lancer l'analyse
            </Button>
          </div>
        ) : (
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            onNodeClick={onNodeClick}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.3}
            maxZoom={2}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(148,163,184,0.1)" />
            <Controls />
            <MiniMap
              nodeColor={(n) => NODE_TYPE_CONFIG[n.data?.type as string]?.color ?? "#94a3b8"}
              maskColor="rgba(8,12,23,0.7)"
            />
            <Panel position="top-left">
              <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs text-muted-foreground space-y-1">
                <p>Cliquez sur un nœud pour voir les détails</p>
                {linkedNodeIds.size > 0 && (
                  <p className="flex items-center gap-1 text-yellow-400">
                    <Shield className="w-3 h-3" />
                    Les nœuds lumineux ont des ADR liées
                  </p>
                )}
              </div>
            </Panel>
          </ReactFlow>
        )}

        {/* Detail panel */}
        {selectedNode && (
          <DetailPanel
            node={selectedNode}
            projectId={activeProject.id}
            allAdrs={allAdrs}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>
    </div>
  );
}
