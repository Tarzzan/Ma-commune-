import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  FolderOpen,
  Plus,
  Trash2,
  CheckCircle2,
  Circle,
  Settings,
  Bot,
  Key,
  Zap,
  CheckCheck,
  AlertCircle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

const schema = z.object({
  name: z.string().min(1, "Nom requis"),
  localPath: z.string().min(1, "Chemin requis"),
  description: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

// ── Section Moteur IA ──────────────────────────────────────────────────────────
function AiEngineSection() {
  const utils = trpc.useUtils();
  const { data: aiSettings, isLoading: aiLoading } = trpc.settings.get.useQuery();
  const [newKey, setNewKey] = useState("");
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    engine: string;
    reply?: string;
    error?: string;
  } | null>(null);

  const updateSettings = trpc.settings.update.useMutation({
    onSuccess: () => {
      toast.success("Paramètres sauvegardés");
      utils.settings.get.invalidate();
      setNewKey("");
      setShowKeyInput(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const testEngine = trpc.settings.test.useMutation({
    onSuccess: (data) => {
      setTestResult(data);
      if (data.success) toast.success(`Moteur ${data.engine} opérationnel ✓`);
      else toast.error(`Erreur : ${data.error}`);
    },
    onError: (e) => {
      setTestResult({ success: false, engine: "", error: e.message });
      toast.error(e.message);
    },
  });

  if (aiLoading) {
    return <div className="animate-pulse h-40 bg-muted/20 rounded-xl" />;
  }

  const currentEngine = aiSettings?.engine ?? "manus_forge";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Bot className="w-5 h-5 text-primary" />
        <h2 className="text-base font-semibold">Moteur IA</h2>
        <span className="text-xs text-muted-foreground ml-1">
          — Sélectionnez le modèle utilisé pour l'analyse des interfaces
        </span>
      </div>

      {/* Sélecteur de moteur */}
      <div className="grid grid-cols-2 gap-3">
        {/* OpenAI */}
        <button
          onClick={() => updateSettings.mutate({ engine: "openai" })}
          disabled={updateSettings.isPending}
          className={`relative p-4 rounded-xl border-2 text-left transition-all ${
            currentEngine === "openai"
              ? "border-primary bg-primary/5"
              : "border-border bg-card hover:border-primary/40"
          }`}
        >
          {currentEngine === "openai" && (
            <CheckCircle2 className="absolute top-3 right-3 w-4 h-4 text-primary" />
          )}
          <div className="font-semibold text-sm mb-1">OpenAI</div>
          <div className="text-xs text-muted-foreground">GPT-4o — Clé API personnelle</div>
          {currentEngine === "openai" && aiSettings?.openaiKeyConfigured && (
            <div className="mt-2 flex items-center gap-1 text-xs text-green-400">
              <Key className="w-3 h-3" />
              <span className="font-mono">{aiSettings.openaiKeyPreview}</span>
            </div>
          )}
          {currentEngine === "openai" && !aiSettings?.openaiKeyConfigured && (
            <div className="mt-2 flex items-center gap-1 text-xs text-amber-400">
              <AlertCircle className="w-3 h-3" />
              <span>Clé non configurée</span>
            </div>
          )}
        </button>

        {/* Manus Forge */}
        <button
          onClick={() => updateSettings.mutate({ engine: "manus_forge" })}
          disabled={updateSettings.isPending}
          className={`relative p-4 rounded-xl border-2 text-left transition-all ${
            currentEngine === "manus_forge"
              ? "border-violet-500 bg-violet-500/5"
              : "border-border bg-card hover:border-violet-500/40"
          }`}
        >
          {currentEngine === "manus_forge" && (
            <CheckCircle2 className="absolute top-3 right-3 w-4 h-4 text-violet-400" />
          )}
          <div className="font-semibold text-sm mb-1">Manus Forge</div>
          <div className="text-xs text-muted-foreground">Claude 3.7 — Proxy sandbox Manus</div>
          <div className="mt-2 flex items-center gap-1 text-xs text-violet-400">
            <Zap className="w-3 h-3" />
            <span>Disponible sur sandbox uniquement</span>
          </div>
        </button>
      </div>

      {/* Champ clé OpenAI (visible si moteur = openai) */}
      {currentEngine === "openai" && (
        <div className="bg-muted/10 border border-border rounded-xl p-4 space-y-3">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Clé API OpenAI
          </div>

          {aiSettings?.openaiKeyConfigured && !showKeyInput ? (
            <div className="flex items-center gap-3">
              <div className="flex-1 font-mono text-sm text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
                {aiSettings.openaiKeyPreview}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowKeyInput(true)}
              >
                Modifier
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="sk-proj-..."
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                className="flex-1 font-mono text-sm"
                autoFocus
              />
              <Button
                size="sm"
                disabled={!newKey.startsWith("sk-") || updateSettings.isPending}
                onClick={() => updateSettings.mutate({ openaiApiKey: newKey })}
              >
                Sauvegarder
              </Button>
              {showKeyInput && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setShowKeyInput(false); setNewKey(""); }}
                >
                  Annuler
                </Button>
              )}
            </div>
          )}

          {/* Modèle */}
          <div className="flex items-center gap-3 pt-1">
            <span className="text-xs text-muted-foreground w-20">Modèle</span>
            <select
              className="flex-1 text-sm bg-muted/30 border border-border rounded-lg px-3 py-1.5 text-foreground"
              value={aiSettings?.openaiModel ?? "gpt-4o"}
              onChange={(e) => updateSettings.mutate({ openaiModel: e.target.value })}
            >
              <option value="gpt-4o">gpt-4o (recommandé)</option>
              <option value="gpt-4o-mini">gpt-4o-mini (économique)</option>
              <option value="gpt-4-turbo">gpt-4-turbo</option>
              <option value="o1">o1 (raisonnement avancé)</option>
            </select>
          </div>
        </div>
      )}

      {/* Bouton Test + résultat */}
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          variant="outline"
          onClick={() => { setTestResult(null); testEngine.mutate(); }}
          disabled={testEngine.isPending}
          className="gap-2"
        >
          <Zap className="w-3.5 h-3.5" />
          {testEngine.isPending ? "Test en cours..." : "Tester le moteur"}
        </Button>
        {testResult && (
          <div
            className={`flex items-center gap-1.5 text-xs ${
              testResult.success ? "text-green-400" : "text-red-400"
            }`}
          >
            {testResult.success ? (
              <>
                <CheckCheck className="w-3.5 h-3.5" />
                Opérationnel ({testResult.engine})
                {testResult.reply && (
                  <span className="text-muted-foreground ml-1">— {testResult.reply}</span>
                )}
              </>
            ) : (
              <>
                <AlertCircle className="w-3.5 h-3.5" />
                {testResult.error?.substring(0, 100)}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page principale Configuration ─────────────────────────────────────────────
export default function Config() {
  const [showForm, setShowForm] = useState(false);
  const utils = trpc.useUtils();

  const { data: projectList = [], isLoading } = trpc.projects.list.useQuery();

  const createProject = trpc.projects.create.useMutation({
    onSuccess: () => {
      toast.success("Projet ajouté avec succès");
      utils.projects.list.invalidate();
      setShowForm(false);
      reset();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteProject = trpc.projects.delete.useMutation({
    onSuccess: () => {
      toast.success("Projet supprimé");
      utils.projects.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = (data: FormData) => createProject.mutate(data);

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings className="w-6 h-6 text-muted-foreground" />
            Configuration
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gérez les projets surveillés et configurez le moteur IA de PIPL.
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          <Plus className="w-4 h-4 mr-2" />
          Ajouter un projet
        </Button>
      </div>

      {/* Section Moteur IA */}
      <div className="bg-card border border-border rounded-xl p-6">
        <AiEngineSection />
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-card border border-primary/30 rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-sm">Nouveau projet</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Nom du projet *</label>
                <Input
                  {...register("name")}
                  placeholder="Mon Application"
                  className="bg-background"
                />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Chemin local absolu *</label>
                <Input
                  {...register("localPath")}
                  placeholder="/home/user/projects/mon-app"
                  className="bg-background font-mono text-xs"
                />
                {errors.localPath && <p className="text-xs text-destructive">{errors.localPath.message}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Description (optionnel)</label>
              <Textarea
                {...register("description")}
                placeholder="Brève description du projet..."
                className="bg-background resize-none h-20"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="ghost" size="sm" onClick={() => { setShowForm(false); reset(); }}>
                Annuler
              </Button>
              <Button type="submit" size="sm" disabled={createProject.isPending}>
                {createProject.isPending ? "Ajout…" : "Ajouter"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Projects list */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Projets configurés ({projectList.length})
        </h2>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-5 animate-pulse h-24" />
            ))}
          </div>
        ) : projectList.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <FolderOpen className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Aucun projet configuré.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Cliquez sur "Ajouter un projet" pour commencer.
            </p>
          </div>
        ) : (
          projectList.map((project) => (
            <div
              key={project.id}
              className="bg-card border border-border rounded-xl p-5 flex items-start gap-4 hover:border-primary/30 transition-colors group"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <FolderOpen className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm">{project.name}</h3>
                  {project.isActive ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                  ) : (
                    <Circle className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </div>
                <p className="text-xs font-mono text-muted-foreground mt-0.5 truncate">
                  {project.localPath}
                </p>
                {project.description && (
                  <p className="text-xs text-muted-foreground mt-1">{project.description}</p>
                )}
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-xs text-muted-foreground">
                    Ajouté {formatDistanceToNow(new Date(project.createdAt), { locale: fr, addSuffix: true })}
                  </span>
                  {project.lastAnalyzedAt && (
                    <span className="text-xs text-green-400">
                      · Analysé{" "}
                      {formatDistanceToNow(new Date(project.lastAnalyzedAt), {
                        locale: fr,
                        addSuffix: true,
                      })}
                    </span>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => {
                  if (confirm("Supprimer ce projet ?")) {
                    deleteProject.mutate({ id: project.id });
                  }
                }}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
