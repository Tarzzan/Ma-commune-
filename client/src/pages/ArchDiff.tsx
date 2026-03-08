import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  type Node,
  type Edge,
  MarkerType,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  GitCompare,
  Plus,
  Minus,
  RefreshCw,
  Trash2,
  ArrowRight,
  CircleDot,
  TrendingUp,
  TrendingDown,
  Minus as MinusIcon,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Diff colour palette ──────────────────────────────────────────────────────
const DIFF_COLORS = {
  added:     { bg: "rgba(52,211,153,0.15)", border: "rgba(52,211,153,0.7)",  text: "#34d399", label: "Ajouté" },
  removed:   { bg: "rgba(248,113,113,0.15)", border: "rgba(248,113,113,0.7)", text: "#f87171", label: "Supprimé" },
  modified:  { bg: "rgba(251,191,36,0.15)", border: "rgba(251,191,36,0.7)",  text: "#fbbf24", label: "Modifié" },
  unchanged: { bg: "rgba(100,116,139,0.08)", border: "rgba(100,116,139,0.3)", text: "#64748b", label: "Inchangé" },
};

const NODE_TYPE_ICONS: Record<string, string> = {
  api: "⚡", db: "🗄", frontend: "🖥", service: "⚙", router: "🔀",
};

// ── Custom diff node ─────────────────────────────────────────────────────────
function DiffNode({ data }: { data: any }) {
  const palette = DIFF_COLORS[data.diffStatus as keyof typeof DIFF_COLORS] ?? DIFF_COLORS.unchanged;
  const icon = NODE_TYPE_ICONS[data.type] ?? "◆";
  return (
    <div
      className="rounded-lg border px-3 py-2 min-w-[150px] cursor-pointer transition-all hover:scale-105"
      style={{ background: palette.bg, borderColor: palette.border, borderWidth: 1.5 }}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm">{icon}</span>
        <span className="text-xs font-semibold truncate" style={{ color: palette.text }}>
          {data.label}
        </span>
        {data.diffStatus !== "unchanged" && (
          <span
            className="ml-auto text-[9px] font-bold px-1 py-0.5 rounded shrink-0"
            style={{ background: palette.border + "33", color: palette.text }}
          >
            {palette.label.toUpperCase()}
          </span>
        )}
      </div>
      {data.file && (
        <p className="text-[10px] text-slate-500 mt-0.5 font-mono truncate">{data.file}</p>
      )}
    </div>
  );
}

const nodeTypes = { diffNode: DiffNode };

// ── Snapshot selector card ───────────────────────────────────────────────────
function SnapshotSelector({
  label,
  snapshots,
  value,
  onChange,
  accent,
}: {
  label: string;
  snapshots: any[];
  value: string;
  onChange: (v: string) => void;
  accent: string;
}) {
  const selected = snapshots.find((s) => String(s.id) === value);
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full inline-block" style={{ background: accent }} />
        {label}
      </p>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 text-xs">
          <SelectValue placeholder="Choisir un snapshot…" />
        </SelectTrigger>
        <SelectContent>
          {snapshots.map((s) => (
            <SelectItem key={s.id} value={String(s.id)}>
              <span className="font-mono text-xs text-muted-foreground mr-2">
                {new Date(s.analyzedAt).toLocaleDateString("fr-FR")} {new Date(s.analyzedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="text-xs">{s.label ?? `Snapshot #${s.id}`}</span>
              <span className="text-xs text-muted-foreground ml-2">({s.nodeCount}n · {s.edgeCount}e)</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selected && (
        <p className="text-[10px] text-muted-foreground">
          {selected.nodeCount} nœuds · {selected.edgeCount} liaisons
        </p>
      )}
    </div>
  );
}

// ── Stat badge ───────────────────────────────────────────────────────────────
function StatBadge({ count, label, color, icon: Icon }: { count: number; label: string; color: string; icon: React.ElementType }) {
  return (
    <div className="flex items-center gap-2 bg-secondary/40 rounded-lg px-3 py-2">
      <Icon className="w-4 h-4 shrink-0" style={{ color }} />
      <div>
        <p className="text-lg font-bold leading-none" style={{ color }}>{count}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function ArchDiff() {
  const { data: projectList = [] } = trpc.projects.list.useQuery();
  const activeProject = projectList[0];

  const [snapshotAId, setSnapshotAId] = useState<string>("");
  const [snapshotBId, setSnapshotBId] = useState<string>("");
  const [showUnchanged, setShowUnchanged] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const { data: snapshots = [], isLoading: snapsLoading } = trpc.analysis.listSnapshots.useQuery(
    { projectId: activeProject?.id ?? 0 },
    { enabled: !!activeProject }
  );

  const canCompare = !!(snapshotAId && snapshotBId && snapshotAId !== snapshotBId);

  const { data: diffResult, isLoading: diffLoading } = trpc.analysis.diff.useQuery(
    { snapshotAId: parseInt(snapshotAId), snapshotBId: parseInt(snapshotBId) },
    { enabled: canCompare && !!parseInt(snapshotAId) && !!parseInt(snapshotBId) }
  );

  const deleteSnapshot = trpc.analysis.deleteSnapshot.useMutation({
    onSuccess: () => {
      toast.success("Snapshot supprimé");
      utils.analysis.listSnapshots.invalidate();
      if (String(deleteTarget) === snapshotAId) setSnapshotAId("");
      if (String(deleteTarget) === snapshotBId) setSnapshotBId("");
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(`Erreur : ${e.message}`),
  });

  // ── Build React Flow nodes from diff ────────────────────────────────────────
  const { flowNodes, flowEdges } = useMemo(() => {
    if (!diffResult) return { flowNodes: [], flowEdges: [] };

    const { nodes, edges } = diffResult;
    const allNodes = [
      ...nodes.added.map((n: any) => ({ ...n, diffStatus: "added" })),
      ...nodes.removed.map((n: any) => ({ ...n, diffStatus: "removed" })),
      ...nodes.modified.map((n: any) => ({ ...n, diffStatus: "modified" })),
      ...(showUnchanged ? nodes.unchanged.map((n: any) => ({ ...n, diffStatus: "unchanged" })) : []),
    ];

    // Simple auto-layout: group by diffStatus in columns
    const groups: Record<string, any[]> = { added: [], removed: [], modified: [], unchanged: [] };
    allNodes.forEach((n) => groups[n.diffStatus]?.push(n));

    const COL_X: Record<string, number> = { added: 0, modified: 260, unchanged: 520, removed: 780 };
    const flowNodes: Node[] = allNodes.map((n, _i) => {
      const col = COL_X[n.diffStatus] ?? 0;
      const rowIdx = groups[n.diffStatus].indexOf(n);
      return {
        id: n.id,
        type: "diffNode",
        position: { x: col, y: rowIdx * 90 },
        data: { label: n.label, type: n.type, file: n.file, diffStatus: n.diffStatus },
      };
    });

    const nodeSet = new Set(allNodes.map((n) => n.id));
    const allEdges = [
      ...edges.added.map((e: any) => ({ ...e, diffStatus: "added" })),
      ...edges.removed.map((e: any) => ({ ...e, diffStatus: "removed" })),
    ];

    const flowEdges: Edge[] = allEdges
      .filter((e: any) => nodeSet.has(e.source) && nodeSet.has(e.target))
      .map((e: any) => {
        const isAdded = e.diffStatus === "added";
        const color = isAdded ? "#34d399" : "#f87171";
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.label,
          animated: isAdded,
          style: { stroke: color, strokeWidth: 1.5, strokeDasharray: isAdded ? undefined : "4 3" },
          markerEnd: { type: MarkerType.ArrowClosed, color },
          labelStyle: { fill: color, fontSize: 10 },
          labelBgStyle: { fill: "rgba(15,23,42,0.8)" },
        };
      });

    return { flowNodes, flowEdges };
  }, [diffResult, showUnchanged]);

  // ── Auto-select latest two snapshots ────────────────────────────────────────
  useMemo(() => {
    if (snapshots.length >= 2 && !snapshotAId && !snapshotBId) {
      setSnapshotAId(String(snapshots[1].id)); // older
      setSnapshotBId(String(snapshots[0].id)); // newer
    }
  }, [snapshots]);

  if (!activeProject) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground text-sm">Configurez un projet d'abord.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <GitCompare className="w-5 h-5 text-cyan-400" />
              Comparaison d'Architecture
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {snapshots.length} snapshot{snapshots.length !== 1 ? "s" : ""} disponible{snapshots.length !== 1 ? "s" : ""}
            </p>
          </div>
          {diffResult && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowUnchanged(!showUnchanged)}
              className="text-xs"
            >
              <CircleDot className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
              {showUnchanged ? "Masquer inchangés" : "Afficher inchangés"}
            </Button>
          )}
        </div>

        {/* Snapshot selectors */}
        <div className="grid grid-cols-2 gap-4">
          <SnapshotSelector
            label="Snapshot A (référence)"
            snapshots={snapshots}
            value={snapshotAId}
            onChange={setSnapshotAId}
            accent="#94a3b8"
          />
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <SnapshotSelector
                label="Snapshot B (comparé)"
                snapshots={snapshots}
                value={snapshotBId}
                onChange={setSnapshotBId}
                accent="#22d3ee"
              />
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground mb-3 shrink-0" />
          </div>
        </div>

        {/* Diff summary stats */}
        {diffResult && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 mt-4">
            <StatBadge count={diffResult.summary.nodesAdded}    label="Nœuds ajoutés"    color="#34d399" icon={Plus} />
            <StatBadge count={diffResult.summary.nodesRemoved}  label="Nœuds supprimés"  color="#f87171" icon={Minus} />
            <StatBadge count={diffResult.summary.nodesModified} label="Nœuds modifiés"   color="#fbbf24" icon={AlertTriangle} />
            <StatBadge count={diffResult.summary.nodesUnchanged} label="Nœuds inchangés" color="#64748b" icon={MinusIcon} />
            <StatBadge count={diffResult.summary.edgesAdded}    label="Liens ajoutés"    color="#34d399" icon={TrendingUp} />
            <StatBadge count={diffResult.summary.edgesRemoved}  label="Liens supprimés"  color="#f87171" icon={TrendingDown} />
          </div>
        )}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* React Flow canvas */}
        <div className="flex-1 relative">
          {!canCompare ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center">
                <GitCompare className="w-8 h-8 text-cyan-400" />
              </div>
              <div className="text-center">
                <p className="font-semibold mb-1">Sélectionnez deux snapshots</p>
                <p className="text-sm text-muted-foreground max-w-xs">
                  {snapshots.length < 2
                    ? "Lancez au moins deux analyses depuis la page Architecture pour pouvoir comparer."
                    : "Choisissez un Snapshot A et un Snapshot B différents pour visualiser les changements."}
                </p>
              </div>
            </div>
          ) : diffLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin" />
            </div>
          ) : flowNodes.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <p className="font-semibold">Aucun changement détecté</p>
              <p className="text-sm text-muted-foreground">Les deux snapshots sont identiques.</p>
            </div>
          ) : (
            <ReactFlow
              nodes={flowNodes}
              edges={flowEdges}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.2}
              maxZoom={2}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(148,163,184,0.1)" />
              <Controls />
              <MiniMap
                nodeColor={(n) => DIFF_COLORS[n.data?.diffStatus as keyof typeof DIFF_COLORS]?.border ?? "#64748b"}
                maskColor="rgba(8,12,23,0.7)"
              />
              <Panel position="top-left">
                <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs space-y-1.5">
                  {Object.entries(DIFF_COLORS).map(([status, cfg]) => (
                    <div key={status} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm border" style={{ background: cfg.bg, borderColor: cfg.border }} />
                      <span style={{ color: cfg.text }}>{cfg.label}</span>
                    </div>
                  ))}
                  <div className="border-t border-border pt-1.5 mt-1">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-0.5 bg-green-400" />
                      <span className="text-muted-foreground">Lien ajouté</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-0.5 bg-red-400" style={{ borderTop: "2px dashed #f87171", background: "transparent" }} />
                      <span className="text-muted-foreground">Lien supprimé</span>
                    </div>
                  </div>
                </div>
              </Panel>
            </ReactFlow>
          )}
        </div>

        {/* Snapshot management sidebar */}
        <div className="w-64 border-l border-border bg-card/50 flex flex-col shrink-0">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Historique des snapshots
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {snapsLoading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : snapshots.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8 px-2">
                Aucun snapshot. Lancez une analyse depuis la page Architecture.
              </p>
            ) : (
              snapshots.map((snap: any) => {
                const isA = String(snap.id) === snapshotAId;
                const isB = String(snap.id) === snapshotBId;
                return (
                  <div
                    key={snap.id}
                    className={cn(
                      "rounded-lg p-2.5 border transition-all cursor-pointer group",
                      isA ? "border-slate-400/50 bg-slate-400/10" :
                      isB ? "border-cyan-400/50 bg-cyan-400/10" :
                      "border-border bg-secondary/20 hover:bg-secondary/40"
                    )}
                    onClick={() => {
                      if (!snapshotAId || (snapshotAId && snapshotBId)) {
                        setSnapshotAId(String(snap.id));
                        setSnapshotBId("");
                      } else {
                        setSnapshotBId(String(snap.id));
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          {isA && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-slate-400/20 text-slate-300">A</span>}
                          {isB && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-cyan-400/20 text-cyan-300">B</span>}
                          <p className="text-xs font-medium truncate">{snap.label ?? `Snapshot #${snap.id}`}</p>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(snap.analyzedAt).toLocaleDateString("fr-FR")} {new Date(snap.analyzedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{snap.nodeCount}n · {snap.edgeCount}e</p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(snap.id); }}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all shrink-0"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="p-3 border-t border-border text-[10px] text-muted-foreground">
            Cliquez sur un snapshot pour le sélectionner comme A, puis un second comme B.
          </div>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {deleteTarget !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl p-6 max-w-sm w-full mx-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-400/10 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <p className="font-semibold">Supprimer ce snapshot ?</p>
                <p className="text-sm text-muted-foreground">Cette action est irréversible.</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>Annuler</Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => deleteSnapshot.mutate({ id: deleteTarget })}
                disabled={deleteSnapshot.isPending}
              >
                {deleteSnapshot.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "Supprimer"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
