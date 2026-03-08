import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Shield, Plus, CheckCircle2, Clock, Archive, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Streamdown } from "streamdown";

const CATEGORIES = [
  { value: "architecture", label: "Architecture", color: "text-indigo-500" },
  { value: "securite", label: "Sécurité", color: "text-red-500" },
  { value: "performance", label: "Performance", color: "text-yellow-500" },
  { value: "infrastructure", label: "Infrastructure", color: "text-green-500" },
  { value: "ux", label: "UX / Interface", color: "text-purple-500" },
  { value: "donnees", label: "Données", color: "text-blue-500" },
];

const schema = z.object({
  title: z.string().min(1, "Titre requis"),
  context: z.string().optional(),
  decision: z.string().min(1, "Décision requise"),
  consequences: z.string().optional(),
  status: z.enum(["proposed", "accepted", "deprecated", "superseded"]),
  category: z.string().default("architecture"),
});
type FormData = z.infer<typeof schema>;

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  proposed: { label: "Proposée", color: "text-blue-400 bg-blue-400/10 border-blue-400/20", icon: Clock },
  accepted: { label: "Acceptée", color: "text-green-400 bg-green-400/10 border-green-400/20", icon: CheckCircle2 },
  deprecated: { label: "Dépréciée", color: "text-red-400 bg-red-400/10 border-red-400/20", icon: Archive },
  superseded: { label: "Remplacée", color: "text-slate-400 bg-slate-400/10 border-slate-400/20", icon: RefreshCw },
};

export default function ADR() {
  const { data: projectList = [] } = trpc.projects.list.useQuery();
  const activeProject = projectList[0];
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const utils = trpc.useUtils();

  const { data: adrList = [], isLoading } = trpc.adr.list.useQuery(
    { projectId: activeProject?.id ?? 0 },
    { enabled: !!activeProject }
  );

  const createAdr = trpc.adr.create.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.adrId} créé avec succès`);
      utils.adr.list.invalidate();
      utils.actions.list.invalidate();
      setShowForm(false);
      reset();
    },
    onError: (e) => toast.error(e.message),
  });

  const seedAdr = trpc.adr.seed.useMutation({
    onSuccess: (data) => {
      if (data.count === 0) {
        toast.info("Des ADR existent déjà — aucun ajout");
      } else {
        toast.success(`${data.count} ADR de démonstration créées`);
        utils.adr.list.invalidate();
        utils.actions.list.invalidate();
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const updateStatus = trpc.adr.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Statut mis à jour");
      utils.adr.list.invalidate();
    },
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: { status: "proposed", category: "architecture" },
  });

  const onSubmit = (data: FormData) => {
    if (!activeProject) return;
    createAdr.mutate({ projectId: activeProject.id, ...data });
  };

  if (!activeProject) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground text-sm">Configurez un projet d'abord.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-6 h-6 text-yellow-400" />
            Décisions d'Architecture
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Architecture Decision Records (ADR) · {adrList.length} décision(s)
          </p>
        </div>
        <div className="flex items-center gap-2">
          {adrList.length === 0 && (
            <Button size="sm" variant="outline" onClick={() => activeProject && seedAdr.mutate({ projectId: activeProject.id })} disabled={seedAdr.isPending}>
              {seedAdr.isPending ? "Chargement..." : "🌱 ADR Ma Commune"}
            </Button>
          )}
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="w-4 h-4 mr-2" />
            Nouvelle décision
          </Button>
        </div>
      </div>

      {/* Category filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setFilterCategory("all")}
          className={cn("text-xs px-3 py-1 rounded-full border transition-colors",
            filterCategory === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"
          )}
        >
          Toutes ({adrList.length})
        </button>
        {CATEGORIES.map(cat => {
          const count = adrList.filter(a => (a as any).category === cat.value).length;
          return (
            <button
              key={cat.value}
              onClick={() => setFilterCategory(cat.value)}
              className={cn("text-xs px-3 py-1 rounded-full border transition-colors",
                filterCategory === cat.value ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"
              )}
            >
              {cat.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Status summary — placeholder closing */}
      {false && null}

      {/* Status summary */}
      <div className="grid grid-cols-4 gap-3">
        {Object.entries(STATUS_CONFIG).map(([status, cfg]) => {
          const count = adrList.filter(a => a.status === status).length;
          const Icon = cfg.icon;
          return (
            <div key={status} className="bg-card border border-border rounded-lg px-4 py-3 flex items-center gap-3">
              <Icon className={cn("w-4 h-4 shrink-0", cfg.color.split(" ")[0])} />
              <div>
                <p className="text-lg font-bold">{count}</p>
                <p className="text-xs text-muted-foreground">{cfg.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-card border border-primary/30 rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-sm">Nouvelle décision d'architecture</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Titre *</label>
                <Input {...register("title")} placeholder="Utiliser tRPC pour les communications API" className="bg-background" />
                {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Catégorie</label>
                <select {...register("category")} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                  {CATEGORIES.map(cat => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Contexte</label>
                <Textarea {...register("context")} placeholder="Pourquoi cette décision est nécessaire…" className="bg-background resize-none h-24" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Décision *</label>
                <Textarea {...register("decision")} placeholder="Nous avons décidé de…" className="bg-background resize-none h-24" />
                {errors.decision && <p className="text-xs text-destructive">{errors.decision.message}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Conséquences</label>
              <Textarea {...register("consequences")} placeholder="Impact positif, négatif, risques…" className="bg-background resize-none h-20" />
            </div>
            <div className="flex items-center gap-2 justify-end">
              <Button type="button" variant="ghost" size="sm" onClick={() => { setShowForm(false); reset(); }}>Annuler</Button>
              <Button type="submit" size="sm" disabled={createAdr.isPending}>
                {createAdr.isPending ? "Création…" : "Créer l'ADR"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* ADR list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="bg-card border border-border rounded-xl p-5 animate-pulse h-20" />)}
        </div>
      ) : adrList.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <Shield className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Aucune décision enregistrée.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {adrList
            .filter(a => filterCategory === "all" || (a as any).category === filterCategory)
            .map((adr) => {
            const cfg = STATUS_CONFIG[adr.status];
            const Icon = cfg.icon;
            const isExpanded = expandedId === adr.id;
            const catLabel = CATEGORIES.find(c => c.value === (adr as any).category)?.label ?? "Architecture";
            return (
              <div
                key={adr.id}
                className="bg-card border border-border rounded-xl overflow-hidden hover:border-primary/20 transition-colors"
              >
                <button
                  className="w-full flex items-start gap-4 px-5 py-4 text-left"
                  onClick={() => setExpandedId(isExpanded ? null : adr.id)}
                >
                  <span className="font-mono text-xs text-muted-foreground shrink-0 mt-0.5">{adr.adrId}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{adr.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(adr.createdAt), { locale: fr, addSuffix: true })}
                    </p>
                  </div>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded border border-border text-muted-foreground shrink-0 mr-1">
                    {catLabel}
                  </span>
                  <span className={cn("text-[10px] font-semibold px-2 py-1 rounded-full border shrink-0", cfg.color)}>
                    {cfg.label}
                  </span>
                </button>

                {isExpanded && (
                  <div className="border-t border-border px-5 py-4 space-y-4">
                    {adr.context && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Contexte</p>
                        <div className="text-sm text-muted-foreground prose prose-sm dark:prose-invert max-w-none prose-code:bg-muted prose-code:px-1 prose-code:rounded prose-pre:bg-muted prose-pre:text-xs">
                          <Streamdown>{adr.context}</Streamdown>
                        </div>
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Décision</p>
                      <div className="text-sm prose prose-sm dark:prose-invert max-w-none prose-code:bg-muted prose-code:px-1 prose-code:rounded prose-pre:bg-muted prose-pre:text-xs">
                        <Streamdown>{adr.decision}</Streamdown>
                      </div>
                    </div>
                    {adr.consequences && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Conséquences</p>
                        <div className="text-sm text-muted-foreground prose prose-sm dark:prose-invert max-w-none prose-code:bg-muted prose-code:px-1 prose-code:rounded prose-pre:bg-muted prose-pre:text-xs">
                          <Streamdown>{adr.consequences}</Streamdown>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-2 pt-2 border-t border-border">
                      <p className="text-xs text-muted-foreground mr-2">Changer le statut :</p>
                      {Object.entries(STATUS_CONFIG).map(([status, c]) => (
                        <button
                          key={status}
                          onClick={() => updateStatus.mutate({ id: adr.id, status: status as any })}
                          className={cn(
                            "text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-opacity",
                            adr.status === status ? c.color : "text-muted-foreground border-border opacity-50 hover:opacity-100"
                          )}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
