import { trpc } from "@/lib/trpc";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Eye, Upload, Search, FileCode, Loader2, X, ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";

interface UiElement {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CodeMatch {
  file: string;
  line: number;
  content: string;
  context: string[];
}

const ELEMENT_COLORS: Record<string, string> = {
  button: "border-blue-400 bg-blue-400/20",
  link: "border-violet-400 bg-violet-400/20",
  input: "border-green-400 bg-green-400/20",
  menu: "border-yellow-400 bg-yellow-400/20",
  tab: "border-orange-400 bg-orange-400/20",
  other: "border-slate-400 bg-slate-400/20",
};

const ELEMENT_LABEL_COLORS: Record<string, string> = {
  button: "text-blue-400 bg-blue-400/10 border-blue-400/30",
  link: "text-violet-400 bg-violet-400/10 border-violet-400/30",
  input: "text-green-400 bg-green-400/10 border-green-400/30",
  menu: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  tab: "text-orange-400 bg-orange-400/10 border-orange-400/30",
  other: "text-slate-400 bg-slate-400/10 border-slate-400/30",
};

export default function UICode() {
  const { data: projectList = [] } = trpc.projects.list.useQuery();
  const activeProject = projectList[0];
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [elements, setElements] = useState<UiElement[]>([]);
  const [selectedElement, setSelectedElement] = useState<UiElement | null>(null);
  const [codeMatches, setCodeMatches] = useState<CodeMatch[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const analyze = trpc.uiCode.analyzeScreenshot.useMutation({
    onSuccess: (data) => {
      setElements(data.elements);
      toast.success(`${data.elements.length} élément(s) détecté(s)`);
    },
    onError: (e) => toast.error(`Erreur d'analyse : ${e.message}`),
  });

  const searchCode = trpc.uiCode.searchInCode.useMutation({
    onSuccess: (data) => {
      setCodeMatches(data);
      if (data.length === 0) toast.info("Aucune occurrence trouvée dans le code");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Veuillez sélectionner une image");
      return;
    }
    setIsUploading(true);
    try {
      // Use local object URL for display, upload to S3 for LLM
      const localUrl = URL.createObjectURL(file);
      setImageUrl(localUrl);
      setElements([]);
      setCodeMatches([]);
      setSelectedElement(null);

      // Upload to S3 for LLM access
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      // Use base64 data URL as fallback since we can't access S3 from client
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setImageUrl(dataUrl);
        toast.success("Image chargée, prête pour l'analyse");
      };
      reader.readAsDataURL(file);
    } catch (err) {
      toast.error("Erreur lors du chargement");
    } finally {
      setIsUploading(false);
    }
  };

  const handleAnalyze = () => {
    if (!imageUrl) return;
    analyze.mutate({
      imageUrl,
      projectId: activeProject?.id ?? 0,
      localPath: activeProject?.localPath ?? "",
    });
  };

  const handleElementClick = (el: UiElement) => {
    setSelectedElement(el);
    setSearchQuery(el.label);
    if (activeProject) {
      searchCode.mutate({ localPath: activeProject.localPath, searchText: el.label });
    }
  };

  const handleManualSearch = () => {
    if (!searchQuery.trim() || !activeProject) return;
    searchCode.mutate({ localPath: activeProject.localPath, searchText: searchQuery });
  };

  if (!activeProject) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground text-sm">Configurez un projet d'abord.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Eye className="w-5 h-5 text-pink-400" />
            Pont UI-Code
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Analysez un screenshot et reliez chaque élément à son code source
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileUpload}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            Charger screenshot
          </Button>
          {imageUrl && (
            <Button size="sm" onClick={handleAnalyze} disabled={analyze.isPending}>
              {analyze.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Eye className="w-4 h-4 mr-2" />}
              {analyze.isPending ? "Analyse IA…" : "Analyser avec IA"}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Image canvas */}
        <div className="flex-1 overflow-auto p-6">
          {!imageUrl ? (
            <div
              className="border-2 border-dashed border-border rounded-2xl flex flex-col items-center justify-center gap-4 h-full min-h-[400px] cursor-pointer hover:border-primary/40 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <div className="w-16 h-16 rounded-2xl bg-pink-400/10 border border-pink-400/20 flex items-center justify-center">
                <Upload className="w-8 h-8 text-pink-400" />
              </div>
              <div className="text-center">
                <p className="font-semibold mb-1">Glissez ou cliquez pour charger un screenshot</p>
                <p className="text-sm text-muted-foreground">PNG, JPG, WebP — Capture d'écran de votre interface</p>
              </div>
            </div>
          ) : (
            <div className="relative inline-block">
              <img
                src={imageUrl}
                alt="Screenshot analysé"
                className="max-w-full rounded-xl border border-border"
                style={{ display: "block" }}
              />
              {/* Overlay elements */}
              {elements.map((el) => (
                <button
                  key={el.id}
                  onClick={() => handleElementClick(el)}
                  className={cn(
                    "absolute border-2 rounded transition-all hover:opacity-100 cursor-pointer",
                    ELEMENT_COLORS[el.type] ?? ELEMENT_COLORS.other,
                    selectedElement?.id === el.id ? "opacity-100 ring-2 ring-white/50" : "opacity-60"
                  )}
                  style={{
                    left: `${el.x}%`,
                    top: `${el.y}%`,
                    width: `${el.width}%`,
                    height: `${el.height}%`,
                  }}
                  title={`${el.type}: ${el.label}`}
                >
                  <span
                    className={cn(
                      "absolute -top-5 left-0 text-[9px] font-semibold px-1.5 py-0.5 rounded border whitespace-nowrap",
                      ELEMENT_LABEL_COLORS[el.type] ?? ELEMENT_LABEL_COLORS.other
                    )}
                  >
                    {el.label.slice(0, 20)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Code panel */}
        <div className="w-96 border-l border-border flex flex-col shrink-0">
          {/* Search */}
          <div className="p-4 border-b border-border space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Recherche dans le code
            </p>
            <div className="flex gap-2">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Texte à rechercher…"
                className="bg-background text-sm h-8"
                onKeyDown={(e) => e.key === "Enter" && handleManualSearch()}
              />
              <Button size="sm" variant="outline" onClick={handleManualSearch} disabled={searchCode.isPending}>
                {searchCode.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              </Button>
            </div>
            {selectedElement && (
              <div className="flex items-center gap-2 bg-secondary/50 rounded-lg px-3 py-2">
                <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border", ELEMENT_LABEL_COLORS[selectedElement.type] ?? ELEMENT_LABEL_COLORS.other)}>
                  {selectedElement.type}
                </span>
                <span className="text-xs truncate">{selectedElement.label}</span>
                <button onClick={() => setSelectedElement(null)} className="ml-auto text-muted-foreground hover:text-foreground">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {elements.length > 0 && !selectedElement && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Éléments détectés ({elements.length})
                </p>
                <div className="space-y-1.5">
                  {elements.map((el) => (
                    <button
                      key={el.id}
                      onClick={() => handleElementClick(el)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/30 hover:bg-secondary/60 transition-colors text-left"
                    >
                      <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0", ELEMENT_LABEL_COLORS[el.type] ?? ELEMENT_LABEL_COLORS.other)}>
                        {el.type}
                      </span>
                      <span className="text-xs truncate">{el.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {codeMatches.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Occurrences dans le code ({codeMatches.length})
                </p>
                <div className="space-y-2">
                  {codeMatches.map((match, i) => (
                    <div key={i} className="bg-secondary/30 rounded-lg p-3 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <FileCode className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className="text-xs font-mono text-primary truncate">{match.file}</span>
                        <span className="text-xs text-muted-foreground shrink-0">:{match.line}</span>
                      </div>
                      <div className="bg-background rounded p-2 overflow-x-auto">
                        <pre className="text-[10px] font-mono text-foreground whitespace-pre-wrap">
                          {match.context.map((line, j) => (
                            <span
                              key={j}
                              className={cn(
                                "block",
                                j === 2 ? "text-yellow-300 bg-yellow-400/10 -mx-2 px-2" : "text-muted-foreground"
                              )}
                            >
                              {line}
                            </span>
                          ))}
                        </pre>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!imageUrl && (
              <div className="text-center text-muted-foreground text-xs pt-8">
                Chargez un screenshot pour commencer
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
