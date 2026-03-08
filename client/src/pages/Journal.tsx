import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Activity,
  GitCommit,
  Search,
  Plus,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";

const ACTION_TYPES = [
  { value: "all", label: "Tous" },
  { value: "git_commit", label: "Commits" },
  { value: "analysis", label: "Analyses" },
  { value: "adr_created", label: "ADR" },
  { value: "idea_promoted", label: "Idées" },
  { value: "manual", label: "Manuel" },
];

const TYPE_COLORS: Record<string, string> = {
  git_commit: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  analysis: "text-violet-400 bg-violet-400/10 border-violet-400/20",
  deployment: "text-green-400 bg-green-400/10 border-green-400/20",
  manual: "text-slate-400 bg-slate-400/10 border-slate-400/20",
  adr_created: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  idea_promoted: "text-orange-400 bg-orange-400/10 border-orange-400/20",
};

const TYPE_LABELS: Record<string, string> = {
  git_commit: "Commit",
  analysis: "Analyse",
  deployment: "Déploiement",
  manual: "Manuel",
  adr_created: "ADR",
  idea_promoted: "Idée promue",
};

export default function Journal() {
  const { data: projectList = [] } = trpc.projects.list.useQuery();
  const activeProject = projectList[0];
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const utils = trpc.useUtils();

  const { data: actions = [], isLoading } = trpc.actions.list.useQuery(
    { projectId: activeProject?.id ?? 0, limit: 100 },
    { enabled: !!activeProject }
  );

  const createAction = trpc.actions.create.useMutation({
    onSuccess: () => {
      toast.success("Action enregistrée");
      utils.actions.list.invalidate();
      utils.actions.stats.invalidate();
      setShowManual(false);
      setManualTitle("");
    },
    onError: (e) => toast.error(e.message),
  });

  const filtered = actions.filter((a) => {
    const matchType = filter === "all" || a.actionType === filter;
    const matchSearch = !search || a.title.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  if (!activeProject) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground text-sm">Configurez un projet d'abord.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="w-6 h-6 text-green-400" />
            Journal d'Actions
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filtered.length} action(s) · {activeProject.name}
          </p>
        </div>
        <Button size="sm" onClick={() => setShowManual(!showManual)}>
          <Plus className="w-4 h-4 mr-2" />
          Action manuelle
        </Button>
      </div>

      {/* Manual entry */}
      {showManual && (
        <div className="bg-card border border-primary/30 rounded-xl p-4 flex gap-3">
          <Input
            value={manualTitle}
            onChange={(e) => setManualTitle(e.target.value)}
            placeholder="Description de l'action manuelle…"
            className="bg-background flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter" && manualTitle.trim()) {
                createAction.mutate({
                  projectId: activeProject.id,
                  actionType: "manual",
                  title: manualTitle.trim(),
                  result: "success",
                });
              }
            }}
          />
          <Button
            size="sm"
            disabled={!manualTitle.trim() || createAction.isPending}
            onClick={() =>
              createAction.mutate({
                projectId: activeProject.id,
                actionType: "manual",
                title: manualTitle.trim(),
                result: "success",
              })
            }
          >
            Enregistrer
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowManual(false)}>
            Annuler
          </Button>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher…"
            className="pl-9 bg-background h-8 text-sm"
          />
        </div>
        <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1">
          {ACTION_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setFilter(t.value)}
              className={cn(
                "text-xs px-2.5 py-1 rounded-md transition-colors",
                filter === t.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse h-16" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <Activity className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Aucune action correspondante.</p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[22px] top-4 bottom-4 w-px bg-border" />
          <div className="space-y-2">
            {filtered.map((action) => (
              <div key={action.id} className="flex gap-4 items-start group">
                {/* Dot */}
                <div
                  className={cn(
                    "w-11 h-11 rounded-full border flex items-center justify-center shrink-0 z-10 bg-background",
                    action.result === "success"
                      ? "border-green-400/30"
                      : action.result === "failure"
                      ? "border-red-400/30"
                      : "border-yellow-400/30"
                  )}
                >
                  {action.result === "success" ? (
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                  ) : action.result === "failure" ? (
                    <XCircle className="w-4 h-4 text-red-400" />
                  ) : (
                    <Clock className="w-4 h-4 text-yellow-400" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 bg-card border border-border rounded-xl px-4 py-3 hover:border-primary/20 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={cn(
                          "text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                          TYPE_COLORS[action.actionType] ?? "text-slate-400 bg-slate-400/10 border-slate-400/20"
                        )}
                      >
                        {TYPE_LABELS[action.actionType] ?? action.actionType}
                      </span>
                      <p className="text-sm font-medium">{action.title}</p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatDistanceToNow(new Date(action.createdAt), { locale: fr, addSuffix: true })}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    {action.author && (
                      <span className="text-xs text-muted-foreground">par {action.author}</span>
                    )}
                    {action.branch && (
                      <span className="text-xs font-mono text-blue-400">{action.branch}</span>
                    )}
                    {action.hash && (
                      <span className="text-xs font-mono text-muted-foreground">
                        {action.hash.slice(0, 7)}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {format(new Date(action.createdAt), "dd/MM/yyyy HH:mm")}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
