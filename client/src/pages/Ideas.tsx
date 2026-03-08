import { trpc } from "@/lib/trpc";
import { useState, useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  BackgroundVariant,
  type Node,
  type Edge,
  type NodeMouseHandler,
  MarkerType,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Brain, Plus, X, Rocket, CheckSquare, Trash2, ListTodo,
  Sparkles, Filter, ArrowUp, Minus, ArrowDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  exploring: "#60a5fa",
  promising: "#fbbf24",
  in_progress: "#a78bfa",
  promoted: "#34d399",
  abandoned: "#6b7280",
};

const STATUS_LABELS: Record<string, string> = {
  exploring: "Exploration",
  promising: "Prometteuse",
  in_progress: "En cours",
  promoted: "Promue",
  abandoned: "Abandonnée",
};

const PRIORITY_COLORS: Record<string, string> = {
  haute: "#f87171",
  moyenne: "#fbbf24",
  basse: "#60a5fa",
};

const PRIORITY_LABELS: Record<string, string> = {
  haute: "Haute",
  moyenne: "Moyenne",
  basse: "Basse",
};

const CATEGORY_LABELS: Record<string, string> = {
  accessibilite: "Accessibilité",
  engagement: "Engagement",
  ux: "UX",
  cartographie: "Cartographie",
  mobile: "Mobile",
  notifications: "Notifications",
  analytics: "Analytics",
  securite: "Sécurité",
  api: "API",
  pwa: "PWA",
  fonctionnalite: "Fonctionnalité",
};

function PriorityBadge({ priority }: { priority: string }) {
  const color = PRIORITY_COLORS[priority] ?? "#60a5fa";
  const Icon = priority === "haute" ? ArrowUp : priority === "basse" ? ArrowDown : Minus;
  return (
    <div
      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold"
      style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}
    >
      <Icon className="w-2.5 h-2.5" />
      {PRIORITY_LABELS[priority] ?? priority}
    </div>
  );
}

function IdeaNode({ data, selected }: { data: any; selected?: boolean }) {
  const color = data.color ?? STATUS_COLORS[data.status] ?? "#60a5fa";
  const priorityColor = PRIORITY_COLORS[data.priority] ?? "#fbbf24";
  return (
    <div
      className={cn(
        "rounded-xl border-2 px-4 py-3 min-w-[170px] max-w-[230px] cursor-pointer transition-all",
        selected ? "ring-2 ring-white/30 scale-105" : "hover:scale-102"
      )}
      style={{ background: `${color}18`, borderColor: `${color}60` }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span
          className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
          style={{ background: `${priorityColor}20`, color: priorityColor }}
        >
          {PRIORITY_LABELS[data.priority] ?? ""}
        </span>
        {data.category && (
          <span className="text-[8px] text-muted-foreground">
            {CATEGORY_LABELS[data.category] ?? data.category}
          </span>
        )}
      </div>
      <p className="text-sm font-semibold text-foreground leading-tight">{data.label}</p>
      {data.description && (
        <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{data.description}</p>
      )}
      <div className="flex items-center gap-1.5 mt-2">
        <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
        <span className="text-[9px] font-medium" style={{ color }}>
          {STATUS_LABELS[data.status] ?? data.status}
        </span>
      </div>
    </div>
  );
}

const nodeTypes = { ideaNode: IdeaNode };

export default function Ideas() {
  const { data: projectList = [] } = trpc.projects.list.useQuery();
  const activeProject = projectList[0];
  const [showAdd, setShowAdd] = useState(false);
  const [showPromote, setShowPromote] = useState(false);
  const [selectedIdea, setSelectedIdea] = useState<any>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newColor, setNewColor] = useState("#60a5fa");
  const [newPriority, setNewPriority] = useState<"haute" | "moyenne" | "basse">("moyenne");
  const [newCategory, setNewCategory] = useState("fonctionnalite");
  const [promoteTasks, setPromoteTasks] = useState([{ title: "", description: "" }]);
  const [showTasks, setShowTasks] = useState(false);
  const [filterPriority, setFilterPriority] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const { data: ideaList = [] } = trpc.ideas.list.useQuery(
    { projectId: activeProject?.id ?? 0 },
    { enabled: !!activeProject }
  );

  const seedIdeas = trpc.ideas.seed.useMutation({
    onSuccess: (res) => {
      if (res.seeded > 0) {
        toast.success(`${res.seeded} idées v1.3 ajoutées à l'arbre !`);
        utils.ideas.list.invalidate();
      } else {
        toast.info(res.message);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const { data: taskList = [] } = trpc.ideas.tasks.useQuery(
    { projectId: activeProject?.id ?? 0 },
    { enabled: !!activeProject }
  );

  const createIdea = trpc.ideas.create.useMutation({
    onSuccess: () => {
      toast.success("Idée ajoutée !");
      utils.ideas.list.invalidate();
      setShowAdd(false);
      setNewTitle("");
      setNewDesc("");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteIdea = trpc.ideas.delete.useMutation({
    onSuccess: () => {
      toast.success("Idée supprimée");
      utils.ideas.list.invalidate();
      setSelectedIdea(null);
    },
  });

  const updateIdea = trpc.ideas.update.useMutation({
    onSuccess: () => utils.ideas.list.invalidate(),
  });

  const promoteIdea = trpc.ideas.promote.useMutation({
    onSuccess: () => {
      toast.success("Idée promue en tâches !");
      utils.ideas.list.invalidate();
      utils.ideas.tasks.invalidate();
      utils.actions.list.invalidate();
      setShowPromote(false);
      setSelectedIdea(null);
      setPromoteTasks([{ title: "", description: "" }]);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateTask = trpc.ideas.updateTask.useMutation({
    onSuccess: () => utils.ideas.tasks.invalidate(),
  });

  const filteredIdeas = useMemo(() => {
    return ideaList.filter(idea => {
      if (filterPriority && idea.priority !== filterPriority) return false;
      if (filterCategory && idea.category !== filterCategory) return false;
      return true;
    });
  }, [ideaList, filterPriority, filterCategory]);

  const availableCategories = useMemo(() => {
    const cats = new Set(ideaList.map(i => i.category).filter(Boolean));
    return Array.from(cats) as string[];
  }, [ideaList]);

  const flowNodes: Node[] = useMemo(() =>
    filteredIdeas.map((idea, i) => ({
      id: String(idea.id),
      type: "ideaNode",
      position: { x: idea.positionX || (i % 4) * 270, y: idea.positionY || Math.floor(i / 4) * 180 },
      data: {
        label: idea.title,
        description: idea.description,
        status: idea.status,
        priority: idea.priority,
        category: idea.category,
        color: idea.color,
        ideaId: idea.id,
      },
    })),
    [filteredIdeas]
  );

  const flowEdges: Edge[] = useMemo(() =>
    filteredIdeas
      .filter(i => i.parentId)
      .map(i => ({
        id: `e_${i.parentId}_${i.id}`,
        source: String(i.parentId),
        target: String(i.id),
        style: { stroke: "rgba(148,163,184,0.3)", strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(148,163,184,0.3)" },
      })),
    [filteredIdeas]
  );

  const onNodeClick: NodeMouseHandler = useCallback((_evt, node) => {
    const idea = ideaList.find(i => String(i.id) === node.id);
    setSelectedIdea(idea ?? null);
  }, [ideaList]);

  const onNodeDragStop = useCallback((_evt: any, node: Node) => {
    updateIdea.mutate({
      id: Number(node.id),
      positionX: Math.round(node.position.x),
      positionY: Math.round(node.position.y),
    });
  }, [updateIdea]);

  if (!activeProject) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground text-sm">Configurez un projet d'abord.</p>
      </div>
    );
  }

  const todoTasks = taskList.filter(t => t.status === "todo");
  const inProgressTasks = taskList.filter(t => t.status === "in_progress");
  const doneTasks = taskList.filter(t => t.status === "done");
  const highCount = ideaList.filter(i => i.priority === "haute").length;
  const medCount = ideaList.filter(i => i.priority === "moyenne").length;
  const lowCount = ideaList.filter(i => i.priority === "basse").length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Brain className="w-5 h-5 text-orange-400" />
            Arbre des Idées
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {ideaList.length} idée(s) · {taskList.length} tâche(s) promue(s)
            {(filterPriority || filterCategory) && (
              <span className="ml-2 text-orange-400">· {filteredIdeas.length} affichée(s)</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowTasks(!showTasks)}>
            <ListTodo className="w-4 h-4 mr-2" />
            Tâches ({taskList.length})
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => seedIdeas.mutate({ projectId: activeProject.id })}
            disabled={seedIdeas.isPending}
          >
            <Sparkles className="w-4 h-4 mr-2" />
            {seedIdeas.isPending ? "Chargement…" : "Idées v1.3"}
          </Button>
          <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
            <Plus className="w-4 h-4 mr-2" />
            Nouvelle idée
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 px-6 py-2 border-b border-border bg-muted/30 shrink-0 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Filter className="w-3.5 h-3.5" />
          <span>Filtres :</span>
        </div>
        {/* Priority pills */}
        {(["haute", "moyenne", "basse"] as const).map(p => {
          const count = p === "haute" ? highCount : p === "moyenne" ? medCount : lowCount;
          const Icon = p === "haute" ? ArrowUp : p === "basse" ? ArrowDown : Minus;
          return (
            <button
              key={p}
              onClick={() => setFilterPriority(filterPriority === p ? null : p)}
              className={cn(
                "flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-all",
                filterPriority === p ? "opacity-100 scale-105" : "opacity-50 hover:opacity-80"
              )}
              style={{
                color: PRIORITY_COLORS[p],
                borderColor: `${PRIORITY_COLORS[p]}50`,
                background: filterPriority === p ? `${PRIORITY_COLORS[p]}20` : "transparent",
              }}
            >
              <Icon className="w-2.5 h-2.5" />
              {PRIORITY_LABELS[p]}
              <span className="opacity-70">({count})</span>
            </button>
          );
        })}
        <div className="w-px h-4 bg-border" />
        {/* Category pills */}
        {availableCategories.map(cat => (
          <button
            key={cat}
            onClick={() => setFilterCategory(filterCategory === cat ? null : cat)}
            className={cn(
              "text-[10px] px-2 py-0.5 rounded-full border transition-all",
              filterCategory === cat
                ? "bg-primary/10 text-primary border-primary/40 font-semibold"
                : "text-muted-foreground border-border hover:border-primary/30 hover:text-foreground"
            )}
          >
            {CATEGORY_LABELS[cat] ?? cat}
          </button>
        ))}
        {(filterPriority || filterCategory) && (
          <button
            onClick={() => { setFilterPriority(null); setFilterCategory(null); }}
            className="text-[10px] text-destructive hover:text-destructive/80 ml-auto flex items-center gap-1"
          >
            <X className="w-3 h-3" />
            Réinitialiser
          </button>
        )}
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="px-6 py-4 border-b border-border bg-card">
          <div className="flex gap-3 items-start max-w-3xl">
            <div className="flex-1 space-y-2">
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Titre de l'idée…"
                className="bg-background"
                autoFocus
              />
              <Textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Description (optionnel)…"
                className="bg-background resize-none h-16 text-sm"
              />
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Priorité :</span>
                  {(["haute", "moyenne", "basse"] as const).map(p => (
                    <button
                      key={p}
                      onClick={() => setNewPriority(p)}
                      className={cn(
                        "text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-all",
                        newPriority === p ? "opacity-100" : "opacity-40 hover:opacity-70"
                      )}
                      style={{
                        color: PRIORITY_COLORS[p],
                        borderColor: `${PRIORITY_COLORS[p]}60`,
                        background: newPriority === p ? `${PRIORITY_COLORS[p]}20` : "transparent",
                      }}
                    >
                      {PRIORITY_LABELS[p]}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Catégorie :</span>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="text-xs bg-background border border-border rounded px-2 py-0.5"
                  >
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex gap-1">
                {["#60a5fa", "#a78bfa", "#34d399", "#fbbf24", "#f87171", "#fb923c"].map(c => (
                  <button
                    key={c}
                    onClick={() => setNewColor(c)}
                    className={cn("w-6 h-6 rounded-full border-2 transition-transform", newColor === c ? "scale-125 border-white" : "border-transparent")}
                    style={{ background: c }}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={!newTitle.trim() || createIdea.isPending}
                  onClick={() => createIdea.mutate({
                    projectId: activeProject.id,
                    title: newTitle.trim(),
                    description: newDesc.trim() || undefined,
                    color: newColor,
                    priority: newPriority,
                    category: newCategory,
                    positionX: Math.floor(Math.random() * 600),
                    positionY: Math.floor(Math.random() * 400),
                  })}
                >
                  Ajouter
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Annuler</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tasks panel */}
      {showTasks && (
        <div className="px-6 py-4 border-b border-border bg-card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">Tâches issues des idées</h3>
            <button onClick={() => setShowTasks(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          {taskList.length === 0 ? (
            <p className="text-xs text-muted-foreground">Aucune tâche. Promouvez une idée pour créer des tâches.</p>
          ) : (
            <div className="grid grid-cols-3 gap-4 max-h-48 overflow-y-auto">
              {[
                { label: "À faire", tasks: todoTasks, status: "todo" as const, color: "text-blue-400" },
                { label: "En cours", tasks: inProgressTasks, status: "in_progress" as const, color: "text-yellow-400" },
                { label: "Terminé", tasks: doneTasks, status: "done" as const, color: "text-green-400" },
              ].map(col => (
                <div key={col.status}>
                  <p className={cn("text-xs font-semibold mb-2", col.color)}>{col.label} ({col.tasks.length})</p>
                  <div className="space-y-1.5">
                    {col.tasks.map(task => (
                      <div key={task.id} className="bg-secondary/30 rounded-lg px-3 py-2 flex items-start gap-2">
                        <button
                          onClick={() => {
                            const next = col.status === "todo" ? "in_progress" : col.status === "in_progress" ? "done" : "todo";
                            updateTask.mutate({ id: task.id, status: next });
                          }}
                          className="mt-0.5 shrink-0"
                        >
                          <CheckSquare className={cn("w-3.5 h-3.5", col.color)} />
                        </button>
                        <p className="text-xs">{task.title}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Mind-map */}
      <div className="flex-1 relative">
        {ideaList.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-orange-400/10 border border-orange-400/20 flex items-center justify-center">
              <Brain className="w-8 h-8 text-orange-400" />
            </div>
            <div className="text-center">
              <p className="font-semibold mb-1">Aucune idée enregistrée</p>
              <p className="text-sm text-muted-foreground">Cliquez sur "Idées v1.3" pour charger les fonctionnalités Ma Commune</p>
            </div>
          </div>
        ) : filteredIdeas.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <Filter className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Aucune idée ne correspond aux filtres actifs</p>
            <Button variant="outline" size="sm" onClick={() => { setFilterPriority(null); setFilterCategory(null); }}>
              Réinitialiser les filtres
            </Button>
          </div>
        ) : (
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            onNodeClick={onNodeClick}
            onNodeDragStop={onNodeDragStop}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            minZoom={0.3}
            maxZoom={2}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="rgba(148,163,184,0.08)" />
            <Controls />
            <Panel position="top-left">
              <div className="bg-card border border-border rounded-lg px-3 py-2 flex items-center gap-3 flex-wrap">
                {/* Priority summary */}
                {highCount > 0 && (
                  <div className="flex items-center gap-1">
                    <ArrowUp className="w-3 h-3 text-red-400" />
                    <span className="text-[10px] font-bold text-red-400">{highCount}</span>
                  </div>
                )}
                {medCount > 0 && (
                  <div className="flex items-center gap-1">
                    <Minus className="w-3 h-3 text-yellow-400" />
                    <span className="text-[10px] font-bold text-yellow-400">{medCount}</span>
                  </div>
                )}
                {lowCount > 0 && (
                  <div className="flex items-center gap-1">
                    <ArrowDown className="w-3 h-3 text-blue-400" />
                    <span className="text-[10px] font-bold text-blue-400">{lowCount}</span>
                  </div>
                )}
                <div className="w-px h-4 bg-border" />
                {/* Status summary */}
                {Object.entries(STATUS_COLORS).map(([status, color]) => {
                  const count = filteredIdeas.filter(i => i.status === status).length;
                  if (count === 0) return null;
                  return (
                    <div key={status} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                      <span className="text-[10px] text-muted-foreground">{STATUS_LABELS[status]}</span>
                      <span className="text-[10px] font-bold">{count}</span>
                    </div>
                  );
                })}
              </div>
            </Panel>
          </ReactFlow>
        )}

        {/* Selected idea panel */}
        {selectedIdea && !showPromote && (
          <div className="absolute right-0 top-0 h-full w-80 bg-card border-l border-border flex flex-col z-10">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="font-semibold text-sm truncate">{selectedIdea.title}</span>
              <button onClick={() => setSelectedIdea(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 p-4 space-y-4 overflow-y-auto">
              {/* Badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <PriorityBadge priority={selectedIdea.priority ?? "moyenne"} />
                {selectedIdea.category && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                    {CATEGORY_LABELS[selectedIdea.category] ?? selectedIdea.category}
                  </span>
                )}
              </div>
              {selectedIdea.description && (
                <p className="text-sm text-muted-foreground">{selectedIdea.description}</p>
              )}
              {/* Status */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Statut</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(STATUS_LABELS).map(([status, label]) => (
                    <button
                      key={status}
                      onClick={() => {
                        updateIdea.mutate({ id: selectedIdea.id, status: status as any });
                        setSelectedIdea({ ...selectedIdea, status });
                      }}
                      className={cn(
                        "text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-opacity",
                        selectedIdea.status === status ? "opacity-100" : "opacity-40 hover:opacity-70"
                      )}
                      style={{
                        color: STATUS_COLORS[status],
                        borderColor: `${STATUS_COLORS[status]}60`,
                        background: `${STATUS_COLORS[status]}15`,
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Priority */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Priorité</p>
                <div className="flex gap-1.5">
                  {(["haute", "moyenne", "basse"] as const).map(p => (
                    <button
                      key={p}
                      onClick={() => {
                        updateIdea.mutate({ id: selectedIdea.id, priority: p });
                        setSelectedIdea({ ...selectedIdea, priority: p });
                      }}
                      className={cn(
                        "text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-all",
                        selectedIdea.priority === p ? "opacity-100 scale-105" : "opacity-40 hover:opacity-70"
                      )}
                      style={{
                        color: PRIORITY_COLORS[p],
                        borderColor: `${PRIORITY_COLORS[p]}60`,
                        background: selectedIdea.priority === p ? `${PRIORITY_COLORS[p]}20` : "transparent",
                      }}
                    >
                      {PRIORITY_LABELS[p]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-border space-y-2">
              {selectedIdea.status !== "promoted" && (
                <Button className="w-full" size="sm" onClick={() => setShowPromote(true)}>
                  <Rocket className="w-4 h-4 mr-2" />
                  Promouvoir en tâches
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => deleteIdea.mutate({ id: selectedIdea.id })}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Supprimer
              </Button>
            </div>
          </div>
        )}

        {/* Promote panel */}
        {showPromote && selectedIdea && (
          <div className="absolute right-0 top-0 h-full w-80 bg-card border-l border-border flex flex-col z-10">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="font-semibold text-sm">Promouvoir en tâches</span>
              <button onClick={() => setShowPromote(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 p-4 space-y-3 overflow-y-auto">
              <p className="text-xs text-muted-foreground">
                Définissez les tâches à créer pour l'idée <strong>{selectedIdea.title}</strong>
              </p>
              {promoteTasks.map((task, i) => (
                <div key={i} className="space-y-2 bg-secondary/30 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground shrink-0">#{i + 1}</span>
                    <Input
                      value={task.title}
                      onChange={(e) => {
                        const updated = [...promoteTasks];
                        updated[i] = { ...updated[i], title: e.target.value };
                        setPromoteTasks(updated);
                      }}
                      placeholder="Titre de la tâche…"
                      className="bg-background text-sm h-7"
                    />
                    {promoteTasks.length > 1 && (
                      <button
                        onClick={() => setPromoteTasks(promoteTasks.filter((_, j) => j !== i))}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setPromoteTasks([...promoteTasks, { title: "", description: "" }])}
              >
                <Plus className="w-3.5 h-3.5 mr-2" />
                Ajouter une tâche
              </Button>
            </div>
            <div className="p-4 border-t border-border">
              <Button
                className="w-full"
                size="sm"
                disabled={promoteTasks.every(t => !t.title.trim()) || promoteIdea.isPending}
                onClick={() =>
                  promoteIdea.mutate({
                    ideaId: selectedIdea.id,
                    projectId: activeProject.id,
                    tasks: promoteTasks.filter(t => t.title.trim()),
                  })
                }
              >
                <Rocket className="w-4 h-4 mr-2" />
                {promoteIdea.isPending ? "Promotion…" : "Confirmer la promotion"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
