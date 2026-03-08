/**
 * MaCommuneWidget — Métriques Ma Commune en direct
 * Utilise le proxy tRPC côté serveur (trpc.maCommune.stats) pour éviter les problèmes CORS.
 *
 * API proxifiée :
 *   GET /mc-api/public/stats     → { total_incidents, resolved, in_progress, submitted, total_votes, total_citizens, resolution_rate, top_categories }
 *   GET /mc-api/public/incidents → { data: [...], pagination: { total, ... } }
 */

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  MapPin,
  RefreshCw,
  Users,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

// Formatage relatif natif (pas de dépendance date-fns)
function timeAgo(dateStr: string): string {
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    if (isNaN(diff)) return "—";
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "à l'instant";
    if (mins < 60) return `il y a ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `il y a ${hours}h`;
    const days = Math.floor(hours / 24);
    return `il y a ${days}j`;
  } catch { return "—"; }
}

// ─── Labels & couleurs ────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  submitted: "Soumis",
  in_progress: "En cours",
  resolved: "Résolu",
  rejected: "Rejeté",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "text-yellow-500 bg-yellow-400/10",
  submitted: "text-orange-400 bg-orange-400/10",
  in_progress: "text-blue-400 bg-blue-400/10",
  resolved: "text-green-400 bg-green-400/10",
  rejected: "text-red-400 bg-red-400/10",
};

// ─── Composant ────────────────────────────────────────────────────────────────

export default function MaCommuneWidget() {
  const { data, isLoading, error, refetch, dataUpdatedAt } = trpc.maCommune.stats.useQuery(
    undefined,
    { refetchInterval: 120_000, retry: 2 }
  );

  const lastFetch = dataUpdatedAt ? new Date(dataUpdatedAt) : null;
  const apiError = error?.message ?? (data && !data.success ? (data as any).error : null);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-emerald-500/10 flex items-center justify-center">
            <MapPin className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <h2 className="font-semibold text-sm">Ma Commune — Métriques live</h2>
          {lastFetch && (
            <span className="text-[10px] text-muted-foreground ml-1">
              · Mis à jour {timeAgo(lastFetch.toISOString())}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <a
            href="https://netetfix.com/admin"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Ouvrir Ma Commune Admin"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            title="Actualiser"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Corps */}
      <div className="p-5">
        {/* État de chargement */}
        {isLoading && !data && (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Connexion à l'API Ma Commune…
          </div>
        )}

        {/* Erreur */}
        {apiError && !data?.total && (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-red-400/5 border border-red-400/20">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-red-400">API indisponible</p>
              <p className="text-xs text-muted-foreground mt-0.5">{apiError}</p>
            </div>
          </div>
        )}

        {/* Données */}
        {data && data.success && (
          <div className="space-y-4">
            {/* KPIs */}
            <div className="grid grid-cols-4 gap-3">
              <div className="text-center">
                <p className="text-xl font-bold text-foreground">{data.total}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
                  <Users className="w-2.5 h-2.5" /> Total
                </p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-yellow-400">{data.pending}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
                  <Clock className="w-2.5 h-2.5" /> Soumis
                </p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-blue-400">{data.in_progress}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
                  <Loader2 className="w-2.5 h-2.5" /> En cours
                </p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-green-400">{data.resolved}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
                  <CheckCircle2 className="w-2.5 h-2.5" /> Résolus
                </p>
              </div>
            </div>

            {/* Citoyens actifs */}
            {data.total_citizens > 0 && (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Users className="w-3 h-3 text-emerald-400" />
                <span>{data.total_citizens} citoyen{data.total_citizens > 1 ? "s" : ""} actif{data.total_citizens > 1 ? "s" : ""}</span>
                {data.resolution_rate !== null && (
                  <span className="ml-auto text-emerald-400 font-medium">
                    {Math.round(Number(data.resolution_rate))}% résolus
                  </span>
                )}
              </div>
            )}

            {/* Barre de progression */}
            {data.total > 0 && (
              <div className="space-y-1">
                <div className="flex h-1.5 rounded-full overflow-hidden bg-muted gap-px">
                  {data.resolved > 0 && (
                    <div
                      className="bg-green-400 transition-all"
                      style={{ width: `${(data.resolved / data.total) * 100}%` }}
                    />
                  )}
                  {data.in_progress > 0 && (
                    <div
                      className="bg-blue-400 transition-all"
                      style={{ width: `${(data.in_progress / data.total) * 100}%` }}
                    />
                  )}
                  {data.pending > 0 && (
                    <div
                      className="bg-yellow-400 transition-all"
                      style={{ width: `${(data.pending / data.total) * 100}%` }}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Signalements récents */}
            {data.recent.length > 0 && (
              <div className="space-y-1 pt-1 border-t border-border">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Signalements récents
                </p>
                {data.recent.map((incident) => (
                  <div key={incident.id} className="flex items-center gap-2 py-1">
                    <span
                      className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${
                        STATUS_COLORS[incident.status] ?? "text-slate-400 bg-slate-400/10"
                      }`}
                    >
                      {STATUS_LABELS[incident.status] ?? incident.status}
                    </span>
                    <span className="text-xs truncate flex-1 text-foreground/80">
                      {incident.title}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {timeAgo(incident.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Aucun incident */}
            {data.total === 0 && (
              <div className="text-center py-4 text-muted-foreground text-xs">
                <CheckCircle2 className="w-6 h-6 text-emerald-400/50 mx-auto mb-2" />
                Aucun signalement pour le moment
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
