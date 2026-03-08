/**
 * MaCommuneWidget — Métriques Ma Commune en direct
 * Affiche les KPIs de l'application citoyenne dans le tableau de bord PIPL
 *
 * API endpoints:
 *   GET /mc-api/public/stats     → { total_incidents, resolved, in_progress, submitted, total_votes, total_citizens, resolution_rate, top_categories }
 *   GET /mc-api/public/incidents → { data: [...], pagination: { total, ... } }
 */

import { useEffect, useState, useCallback } from "react";
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface IncidentStats {
  total: number;
  pending: number;
  in_progress: number;
  resolved: number;
  total_citizens: number;
  resolution_rate: number | null;
  recent: Array<{
    id: number;
    title: string | null;
    status: string;
    category_name: string;
    created_at: string;
    commune: string | null;
  }>;
}

interface MaCommuneData {
  incidents: IncidentStats | null;
  lastFetch: Date | null;
  error: string | null;
  loading: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MC_API = "https://netetfix.com/mc-api";

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
  const [data, setData] = useState<MaCommuneData>({
    incidents: null,
    lastFetch: null,
    error: null,
    loading: true,
  });

  const fetchData = useCallback(async () => {
    setData((prev) => ({ ...prev, loading: true, error: null }));
    try {
      // Appels parallèles : stats globales + incidents récents
      const [statsRes, incidentsRes] = await Promise.all([
        fetch(`${MC_API}/public/stats`, { headers: { Accept: "application/json" } }),
        fetch(`${MC_API}/public/incidents?limit=5`, { headers: { Accept: "application/json" } }),
      ]);

      if (!statsRes.ok) throw new Error(`Stats API HTTP ${statsRes.status}`);
      if (!incidentsRes.ok) throw new Error(`Incidents API HTTP ${incidentsRes.status}`);

      const statsJson = await statsRes.json();
      const incidentsJson = await incidentsRes.json();

      const statsData = statsJson.data ?? {};
      const incidentsList: any[] = incidentsJson.data?.data ?? [];

      const stats: IncidentStats = {
        total: statsData.total_incidents ?? 0,
        pending: statsData.submitted ?? 0,
        in_progress: statsData.in_progress ?? 0,
        resolved: statsData.resolved ?? 0,
        total_citizens: statsData.total_citizens ?? 0,
        resolution_rate: statsData.resolution_rate ?? null,
        recent: incidentsList.slice(0, 5).map((i: any) => ({
          id: i.id,
          title: i.title ?? i.description?.slice(0, 60) ?? "Signalement",
          status: i.status,
          category_name: i.category_name ?? i.category?.name ?? "—",
          created_at: i.created_at,
          commune: i.commune ?? null,
        })),
      };

      setData({ incidents: stats, lastFetch: new Date(), error: null, loading: false });
    } catch (err: any) {
      setData((prev) => ({
        ...prev,
        loading: false,
        error: err?.message ?? "Impossible de contacter l'API Ma Commune",
      }));
    }
  }, []);

  // Chargement initial + rafraîchissement toutes les 2 minutes
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 120_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-emerald-500/10 flex items-center justify-center">
            <MapPin className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <h2 className="font-semibold text-sm">Ma Commune — Métriques live</h2>
            {data.lastFetch && (
            <span className="text-[10px] text-muted-foreground ml-1">
              · Mis à jour {timeAgo(data.lastFetch.toISOString())}
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
            onClick={fetchData}
            disabled={data.loading}
            className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            title="Actualiser"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${data.loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Corps */}
      <div className="p-5">
        {/* État de chargement */}
        {data.loading && !data.incidents && (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Connexion à l'API Ma Commune…
          </div>
        )}

        {/* Erreur */}
        {data.error && !data.incidents && (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-red-400/5 border border-red-400/20">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-red-400">API indisponible</p>
              <p className="text-xs text-muted-foreground mt-0.5">{data.error}</p>
            </div>
          </div>
        )}

        {/* Données */}
        {data.incidents && (
          <div className="space-y-4">
            {/* KPIs */}
            <div className="grid grid-cols-4 gap-3">
              <div className="text-center">
                <p className="text-xl font-bold text-foreground">{data.incidents.total}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
                  <Users className="w-2.5 h-2.5" /> Total
                </p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-yellow-400">{data.incidents.pending}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
                  <Clock className="w-2.5 h-2.5" /> Soumis
                </p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-blue-400">{data.incidents.in_progress}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
                  <Loader2 className="w-2.5 h-2.5" /> En cours
                </p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-green-400">{data.incidents.resolved}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
                  <CheckCircle2 className="w-2.5 h-2.5" /> Résolus
                </p>
              </div>
            </div>

            {/* Citoyens actifs */}
            {data.incidents.total_citizens > 0 && (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Users className="w-3 h-3 text-emerald-400" />
                <span>{data.incidents.total_citizens} citoyen{data.incidents.total_citizens > 1 ? "s" : ""} actif{data.incidents.total_citizens > 1 ? "s" : ""}</span>
                {data.incidents.resolution_rate !== null && (
                  <span className="ml-auto text-emerald-400 font-medium">
                    {Math.round(Number(data.incidents.resolution_rate))}% résolus
                  </span>
                )}
              </div>
            )}

            {/* Barre de progression */}
            {data.incidents.total > 0 && (
              <div className="space-y-1">
                <div className="flex h-1.5 rounded-full overflow-hidden bg-muted gap-px">
                  {data.incidents.resolved > 0 && (
                    <div
                      className="bg-green-400 transition-all"
                      style={{ width: `${(data.incidents.resolved / data.incidents.total) * 100}%` }}
                    />
                  )}
                  {data.incidents.in_progress > 0 && (
                    <div
                      className="bg-blue-400 transition-all"
                      style={{ width: `${(data.incidents.in_progress / data.incidents.total) * 100}%` }}
                    />
                  )}
                  {data.incidents.pending > 0 && (
                    <div
                      className="bg-yellow-400 transition-all"
                      style={{ width: `${(data.incidents.pending / data.incidents.total) * 100}%` }}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Signalements récents */}
            {data.incidents.recent.length > 0 && (
              <div className="space-y-1 pt-1 border-t border-border">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Signalements récents
                </p>
                {data.incidents.recent.map((incident) => (
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
            {data.incidents.total === 0 && (
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
