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
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

const schema = z.object({
  name: z.string().min(1, "Nom requis"),
  localPath: z.string().min(1, "Chemin requis"),
  description: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

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
            Gérez les projets locaux que la PIPL surveille et analyse.
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          <Plus className="w-4 h-4 mr-2" />
          Ajouter un projet
        </Button>
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
            {[1, 2].map(i => (
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
                <p className="text-xs font-mono text-muted-foreground mt-0.5 truncate">{project.localPath}</p>
                {project.description && (
                  <p className="text-xs text-muted-foreground mt-1">{project.description}</p>
                )}
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-xs text-muted-foreground">
                    Ajouté {formatDistanceToNow(new Date(project.createdAt), { locale: fr, addSuffix: true })}
                  </span>
                  {project.lastAnalyzedAt && (
                    <span className="text-xs text-green-400">
                      · Analysé {formatDistanceToNow(new Date(project.lastAnalyzedAt), { locale: fr, addSuffix: true })}
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
