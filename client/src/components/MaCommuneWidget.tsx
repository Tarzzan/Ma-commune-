/**
 * MaCommuneWidget — Métriques Ma Commune en direct
 * Affiche les KPIs de l'application citoyenne dans le tableau de bord PIPL
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
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

// ─── Types ────────────────────────────────────────────────────────────────────

interface IncidentStats {
  total: number;
  pending: number;
  in_progress: number;
  resolved: number;
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
  in_progress: "En cours",
  resolved: "Résolu",
  rejected: "Rejeté",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "text-yellow-500 bg-yellow-400/10",
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
      const res = await fetch(`${MC_API}/incidents?limit=5&sort=recent`, {
        headers: { Accept: "application/json" },
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      // Calculer les stats depuis la liste
      const list: any[] = json.data ?? [];
      const stats: IncidentStats = {
        total: json.total ?? list.length,
        pending: list.filter((i) => i.status === "pending").length,
        in_progress: list.filter((i) => i.status === "in_progress").length,
        resolved: list.filter((i) => i.status === "resolved").length,
        recent: list.slice(0, 5).map((i) => ({
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
              · Mis à jour {formatDistanceToNow(data.lastFetch, { locale: fr, addSuffix: true })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <a
            href="https://netetfix.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Ouvrir Ma Commune"
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
                  <Clock className="w-2.5 h-2.5" /> En attente
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
                <p className="text-[10px] text-muted-foreground text-right">
                  {data.incidents.total > 0
                    ? `${Math.round((data.incidents.resolved / data.incidents.total) * 100)}% résolus`
                    : "Aucun signalement"}
                </p>
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
                      {formatDistanceToNow(new Date(incident.created_at), {
                        locale: fr,
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
