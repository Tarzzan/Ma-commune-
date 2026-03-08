import { trpc } from "@/lib/trpc";
import { useState } from "react";
import {
  Activity,
  Brain,
  CheckCircle2,
  Clock,
  Cpu,
  GitCommit,
  Shield,
  TrendingUp,
  Zap,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

const ACTION_TYPE_LABELS: Record<string, string> = {
  git_commit: "Commit",
  analysis: "Analyse",
  deployment: "Déploiement",
  manual: "Manuel",
  adr_created: "ADR",
  idea_promoted: "Idée promue",
};

const ACTION_TYPE_COLORS: Record<string, string> = {
  git_commit: "text-blue-400 bg-blue-400/10",
  analysis: "text-violet-400 bg-violet-400/10",
  deployment: "text-green-400 bg-green-400/10",
  manual: "text-slate-400 bg-slate-400/10",
  adr_created: "text-yellow-400 bg-yellow-400/10",
  idea_promoted: "text-orange-400 bg-orange-400/10",
};

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 flex items-start gap-4 hover:border-primary/30 transition-colors">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-foreground mt-0.5">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: projectList = [] } = trpc.projects.list.useQuery();
  const activeProject = projectList[0];

  const { data: stats } = trpc.actions.stats.useQuery(
    { projectId: activeProject?.id ?? 0 },
    { enabled: !!activeProject }
  );
  const { data: actions = [] } = trpc.actions.list.useQuery(
    { projectId: activeProject?.id ?? 0, limit: 10 },
    { enabled: !!activeProject }
  );
  const { data: adrList = [] } = trpc.adr.list.useQuery(
    { projectId: activeProject?.id ?? 0 },
    { enabled: !!activeProject }
  );
  const { data: ideaList = [] } = trpc.ideas.list.useQuery(
    { projectId: activeProject?.id ?? 0 },
    { enabled: !!activeProject }
  );
  const { data: cache } = trpc.analysis.getCache.useQuery(
    { projectId: activeProject?.id ?? 0 },
    { enabled: !!activeProject }
  );

  if (!activeProject) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
        <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Cpu className="w-10 h-10 text-primary" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2">Aucun projet configuré</h2>
          <p className="text-muted-foreground text-sm max-w-sm">
            Rendez-vous dans la page{" "}
            <a href="/config" className="text-primary hover:underline">Configuration</a>{" "}
            pour ajouter votre premier projet à analyser.
          </p>
        </div>
      </div>
    );
  }

  const nodesCount = Array.isArray((cache?.nodes as any)) ? (cache?.nodes as any[]).length : 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{activeProject.name}</h1>
          <p className="text-sm text-muted-foreground mt-1 font-mono">{activeProject.localPath}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400 pulse-ring" />
          <span className="text-xs text-muted-foreground">Projet actif</span>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={GitCommit}
          label="Commits suivis"
          value={stats?.commits ?? 0}
          sub={`${stats?.total ?? 0} actions totales`}
          color="bg-blue-400/10 text-blue-400"
        />
        <KpiCard
          icon={Cpu}
          label="Nœuds d'architecture"
          value={nodesCount}
          sub={cache ? `Analysé ${formatDistanceToNow(new Date(cache.analyzedAt), { locale: fr, addSuffix: true })}` : "Jamais analysé"}
          color="bg-violet-400/10 text-violet-400"
        />
        <KpiCard
          icon={Shield}
          label="Décisions (ADR)"
          value={adrList.length}
          sub={`${adrList.filter(a => a.status === "accepted").length} acceptées`}
          color="bg-yellow-400/10 text-yellow-400"
        />
        <KpiCard
          icon={Brain}
          label="Idées de développement"
          value={ideaList.length}
          sub={`${ideaList.filter(i => i.status === "promoted").length} promues en tâches`}
          color="bg-orange-400/10 text-orange-400"
        />
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity feed */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
            <Activity className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-sm">Activité récente</h2>
          </div>
          <div className="divide-y divide-border">
            {actions.length === 0 ? (
              <div className="px-5 py-8 text-center text-muted-foreground text-sm">
                Aucune activité enregistrée. Lancez une analyse ou attendez un commit Git.
              </div>
            ) : (
              actions.map((action) => (
                <div key={action.id} className="flex items-start gap-3 px-5 py-3 hover:bg-secondary/30 transition-colors">
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 mt-0.5 ${ACTION_TYPE_COLORS[action.actionType] ?? "text-slate-400 bg-slate-400/10"}`}
                  >
                    {ACTION_TYPE_LABELS[action.actionType] ?? action.actionType}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{action.title}</p>
                    {action.author && (
                      <p className="text-xs text-muted-foreground">{action.author}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(action.createdAt), { locale: fr, addSuffix: true })}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quick stats */}
        <div className="space-y-4">
          {/* ADR status */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-4 h-4 text-yellow-400" />
              <h3 className="font-semibold text-sm">Statut des ADR</h3>
            </div>
            {adrList.length === 0 ? (
              <p className="text-xs text-muted-foreground">Aucune décision enregistrée</p>
            ) : (
              <div className="space-y-2">
                {(["accepted", "proposed", "deprecated", "superseded"] as const).map((status) => {
                  const count = adrList.filter(a => a.status === status).length;
                  if (count === 0) return null;
                  const colors: Record<string, string> = {
                    accepted: "bg-green-400",
                    proposed: "bg-blue-400",
                    deprecated: "bg-red-400",
                    superseded: "bg-slate-400",
                  };
                  const labels: Record<string, string> = {
                    accepted: "Acceptées",
                    proposed: "Proposées",
                    deprecated: "Dépréciées",
                    superseded: "Remplacées",
                  };
                  return (
                    <div key={status} className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${colors[status]}`} />
                      <span className="text-xs text-muted-foreground flex-1">{labels[status]}</span>
                      <span className="text-xs font-semibold">{count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Ideas status */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Brain className="w-4 h-4 text-orange-400" />
              <h3 className="font-semibold text-sm">Idées par statut</h3>
            </div>
            {ideaList.length === 0 ? (
              <p className="text-xs text-muted-foreground">Aucune idée enregistrée</p>
            ) : (
              <div className="space-y-2">
                {(["exploring", "promising", "in_progress", "promoted", "abandoned"] as const).map((status) => {
                  const count = ideaList.filter(i => i.status === status).length;
                  if (count === 0) return null;
                  const labels: Record<string, string> = {
                    exploring: "En exploration",
                    promising: "Prometteuses",
                    in_progress: "En cours",
                    promoted: "Promues",
                    abandoned: "Abandonnées",
                  };
                  return (
                    <div key={status} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground flex-1">{labels[status]}</span>
                      <span className="text-xs font-semibold">{count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Project info */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm">Projet</h3>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  Créé {formatDistanceToNow(new Date(activeProject.createdAt), { locale: fr, addSuffix: true })}
                </span>
              </div>
              {activeProject.lastAnalyzedAt && (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3 h-3 text-green-400" />
                  <span className="text-xs text-muted-foreground">
                    Analysé {formatDistanceToNow(new Date(activeProject.lastAnalyzedAt), { locale: fr, addSuffix: true })}
                  </span>
                </div>
              )}
              {activeProject.description && (
                <p className="text-xs text-muted-foreground mt-2 border-t border-border pt-2">
                  {activeProject.description}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
