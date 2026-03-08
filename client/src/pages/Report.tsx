import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  FileText,
  Download,
  Loader2,
  CheckCircle2,
  GitCommit,
  Shield,
  Brain,
  Activity,
  Calendar,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  proposed: "text-blue-400",
  accepted: "text-green-400",
  deprecated: "text-red-400",
  superseded: "text-slate-400",
};

const STATUS_LABELS: Record<string, string> = {
  proposed: "Proposée",
  accepted: "Acceptée",
  deprecated: "Dépréciée",
  superseded: "Remplacée",
};

const ACTION_LABELS: Record<string, string> = {
  git_commit: "Commit",
  analysis: "Analyse",
  deployment: "Déploiement",
  manual: "Manuel",
  adr_created: "ADR",
  idea_promoted: "Idée promue",
};

export default function Report() {
  const { data: projectList = [] } = trpc.projects.list.useQuery();
  const activeProject = projectList[0];
  const [isExporting, setIsExporting] = useState(false);

  const { data: report, isLoading, refetch } = trpc.report.generate.useQuery(
    { projectId: activeProject?.id ?? 0 },
    { enabled: !!activeProject }
  );

  const handleExportPDF = async () => {
    if (!report) return;
    setIsExporting(true);
    try {
      // Dynamic import to avoid SSR issues
      const { default: jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

      const pageW = 210;
      const margin = 15;
      const contentW = pageW - margin * 2;
      let y = 20;

      const addText = (text: string, x: number, yPos: number, opts: any = {}) => {
        doc.text(text, x, yPos, opts);
      };

      const addSection = (title: string, icon: string) => {
        if (y > 260) { doc.addPage(); y = 20; }
        doc.setFillColor(20, 25, 40);
        doc.rect(margin, y - 5, contentW, 10, "F");
        doc.setTextColor(100, 160, 255);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        addText(`${icon}  ${title}`, margin + 3, y + 1);
        doc.setTextColor(220, 220, 230);
        doc.setFont("helvetica", "normal");
        y += 12;
      };

      // ── Cover ──
      doc.setFillColor(10, 15, 30);
      doc.rect(0, 0, 210, 297, "F");

      doc.setTextColor(100, 160, 255);
      doc.setFontSize(28);
      doc.setFont("helvetica", "bold");
      addText("PIPL", pageW / 2, 60, { align: "center" });

      doc.setTextColor(180, 190, 210);
      doc.setFontSize(14);
      doc.setFont("helvetica", "normal");
      addText("Rapport d'Intelligence de Projet", pageW / 2, 72, { align: "center" });

      doc.setFontSize(11);
      doc.setTextColor(120, 130, 160);
      addText(report.project.name, pageW / 2, 84, { align: "center" });
      addText(
        `Généré le ${format(new Date(report.generatedAt), "dd MMMM yyyy à HH:mm", { locale: fr })}`,
        pageW / 2, 92, { align: "center" }
      );

      // Stats summary on cover
      const stats = [
        { label: "Actions", value: report.actions.length },
        { label: "Décisions ADR", value: report.adrs.length },
        { label: "Idées", value: report.ideas.length },
        { label: "Tâches", value: report.tasks.length },
      ];
      const statW = contentW / 4;
      stats.forEach((s, i) => {
        const sx = margin + i * statW + statW / 2;
        doc.setFillColor(20, 30, 55);
        doc.roundedRect(margin + i * statW, 110, statW - 4, 22, 3, 3, "F");
        doc.setTextColor(100, 160, 255);
        doc.setFontSize(18);
        doc.setFont("helvetica", "bold");
        addText(String(s.value), sx, 122, { align: "center" });
        doc.setTextColor(140, 150, 180);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        addText(s.label, sx, 128, { align: "center" });
      });

      // ── Page 2: Content ──
      doc.addPage();
      doc.setFillColor(10, 15, 30);
      doc.rect(0, 0, 210, 297, "F");
      doc.setTextColor(220, 220, 230);
      y = 20;

      // Project info
      addSection("Informations du Projet", "📁");
      doc.setFontSize(9);
      const infoLines = [
        `Nom : ${report.project.name}`,
        `Chemin local : ${report.project.localPath}`,
        report.project.description ? `Description : ${report.project.description}` : null,
        `Créé le : ${format(new Date(report.project.createdAt), "dd/MM/yyyy", { locale: fr })}`,
        report.project.lastAnalyzedAt
          ? `Dernière analyse : ${format(new Date(report.project.lastAnalyzedAt), "dd/MM/yyyy HH:mm", { locale: fr })}`
          : "Dernière analyse : Jamais",
      ].filter(Boolean) as string[];
      infoLines.forEach(line => {
        if (y > 270) { doc.addPage(); doc.setFillColor(10, 15, 30); doc.rect(0, 0, 210, 297, "F"); y = 20; }
        addText(line, margin, y);
        y += 6;
      });
      y += 4;

      // Architecture
      if (report.architecture) {
        addSection("Architecture Analysée", "🗺️");
        doc.setFontSize(9);
        const nodes = (report.architecture.nodes as any[]) ?? [];
        const edges = (report.architecture.edges as any[]) ?? [];
        addText(`${nodes.length} nœud(s) détecté(s) · ${edges.length} liaison(s)`, margin, y);
        y += 6;
        const byType: Record<string, number> = {};
        nodes.forEach((n: any) => { byType[n.type] = (byType[n.type] ?? 0) + 1; });
        Object.entries(byType).forEach(([type, count]) => {
          addText(`  • ${type} : ${count}`, margin, y);
          y += 5;
        });
        y += 4;
      }

      // ADR
      if (report.adrs.length > 0) {
        addSection("Décisions d'Architecture (ADR)", "🛡️");
        doc.setFontSize(9);
        report.adrs.forEach((adr) => {
          if (y > 265) { doc.addPage(); doc.setFillColor(10, 15, 30); doc.rect(0, 0, 210, 297, "F"); y = 20; }
          doc.setFont("helvetica", "bold");
          addText(`${adr.adrId} — ${adr.title}`, margin, y);
          doc.setFont("helvetica", "normal");
          y += 5;
          addText(`Statut : ${STATUS_LABELS[adr.status] ?? adr.status}`, margin + 4, y);
          y += 5;
          if (adr.decision) {
            const lines = doc.splitTextToSize(`Décision : ${adr.decision}`, contentW - 4);
            lines.forEach((line: string) => {
              if (y > 270) { doc.addPage(); doc.setFillColor(10, 15, 30); doc.rect(0, 0, 210, 297, "F"); y = 20; }
              addText(line, margin + 4, y);
              y += 4.5;
            });
          }
          y += 3;
        });
      }

      // Journal (last 20)
      const recentActions = report.actions.slice(0, 20);
      if (recentActions.length > 0) {
        addSection("Journal d'Actions (20 dernières)", "📋");
        doc.setFontSize(8);
        recentActions.forEach((action) => {
          if (y > 270) { doc.addPage(); doc.setFillColor(10, 15, 30); doc.rect(0, 0, 210, 297, "F"); y = 20; }
          const date = format(new Date(action.createdAt), "dd/MM HH:mm");
          const type = ACTION_LABELS[action.actionType] ?? action.actionType;
          const line = `${date}  [${type}]  ${action.title.slice(0, 70)}`;
          addText(line, margin, y);
          y += 5;
        });
      }

      // Ideas
      if (report.ideas.length > 0) {
        addSection("Arbre des Idées", "🧠");
        doc.setFontSize(9);
        report.ideas.forEach((idea) => {
          if (y > 270) { doc.addPage(); doc.setFillColor(10, 15, 30); doc.rect(0, 0, 210, 297, "F"); y = 20; }
          addText(`• ${idea.title} [${idea.status}]`, margin, y);
          y += 5;
        });
      }

      // Footer on all pages
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(80, 90, 120);
        addText(`PIPL — ${report.project.name} — Page ${i}/${totalPages}`, pageW / 2, 292, { align: "center" });
      }

      const fileName = `PIPL_${report.project.name.replace(/\s+/g, "_")}_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`;
      doc.save(fileName);
      toast.success(`Rapport exporté : ${fileName}`);
    } catch (err) {
      console.error(err);
      toast.error("Erreur lors de l'export PDF");
    } finally {
      setIsExporting(false);
    }
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
            <FileText className="w-6 h-6 text-cyan-400" />
            Rapport de Projet
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vue consolidée de l'état du projet — exportable en PDF
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Actualiser
          </Button>
          <Button size="sm" onClick={handleExportPDF} disabled={isExporting || !report}>
            {isExporting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            {isExporting ? "Export en cours…" : "Exporter PDF"}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="bg-card border border-border rounded-xl p-5 animate-pulse h-28" />)}
        </div>
      ) : report ? (
        <>
          {/* Stats */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Actions", value: report.actions.length, icon: Activity, color: "text-green-400" },
              { label: "Décisions ADR", value: report.adrs.length, icon: Shield, color: "text-yellow-400" },
              { label: "Idées", value: report.ideas.length, icon: Brain, color: "text-orange-400" },
              { label: "Tâches", value: report.tasks.length, icon: CheckCircle2, color: "text-violet-400" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
                <Icon className={cn("w-5 h-5 shrink-0", color)} />
                <div>
                  <p className="text-2xl font-bold">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Project info */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-2">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Calendar className="w-4 h-4 text-cyan-400" />
              Informations du Projet
            </h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Nom</p>
                <p className="font-medium">{report.project.name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Chemin local</p>
                <p className="font-mono text-xs truncate">{report.project.localPath}</p>
              </div>
              {report.project.description && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Description</p>
                  <p>{report.project.description}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">Créé le</p>
                <p>{format(new Date(report.project.createdAt), "dd MMMM yyyy", { locale: fr })}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Dernière analyse</p>
                <p>{report.project.lastAnalyzedAt
                  ? format(new Date(report.project.lastAnalyzedAt), "dd/MM/yyyy HH:mm")
                  : "Jamais"}</p>
              </div>
            </div>
          </div>

          {/* Recent ADRs */}
          {report.adrs.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <Shield className="w-4 h-4 text-yellow-400" />
                Décisions d'Architecture ({report.adrs.length})
              </h2>
              <div className="space-y-2">
                {report.adrs.slice(0, 5).map(adr => (
                  <div key={adr.id} className="flex items-start gap-3 text-sm">
                    <span className="font-mono text-xs text-muted-foreground shrink-0 mt-0.5">{adr.adrId}</span>
                    <span className="flex-1 truncate">{adr.title}</span>
                    <span className={cn("text-xs shrink-0", STATUS_COLORS[adr.status])}>
                      {STATUS_LABELS[adr.status]}
                    </span>
                  </div>
                ))}
                {report.adrs.length > 5 && (
                  <p className="text-xs text-muted-foreground">+ {report.adrs.length - 5} autre(s)…</p>
                )}
              </div>
            </div>
          )}

          {/* Recent actions */}
          {report.actions.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <GitCommit className="w-4 h-4 text-green-400" />
                Journal d'Actions (10 dernières)
              </h2>
              <div className="space-y-1.5">
                {report.actions.slice(0, 10).map(action => (
                  <div key={action.id} className="flex items-center gap-3 text-xs">
                    <span className="text-muted-foreground shrink-0 w-28">
                      {format(new Date(action.createdAt), "dd/MM HH:mm")}
                    </span>
                    <span className="text-muted-foreground shrink-0 w-20">
                      {ACTION_LABELS[action.actionType] ?? action.actionType}
                    </span>
                    <span className="flex-1 truncate">{action.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Generated at */}
          <p className="text-xs text-muted-foreground text-center">
            Rapport généré le {format(new Date(report.generatedAt), "dd MMMM yyyy à HH:mm", { locale: fr })}
          </p>
        </>
      ) : null}
    </div>
  );
}
