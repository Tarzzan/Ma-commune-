import { trpc } from "@/lib/trpc";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Eye,
  Upload,
  Search,
  FileCode,
  Loader2,
  X,
  ExternalLink,
  Layout,
  ChevronRight,
  Code2,
  Globe,
  Smartphone,
  Monitor,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UiElement {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  sourceFile?: string;
}

interface CodeMatch {
  file: string;
  line: number;
  content: string;
  context: string[];
}

// ─── Screenshots Ma Commune ───────────────────────────────────────────────────

interface ScreenshotEntry {
  id: string;
  label: string;
  description: string;
  url: string;
  sourceFile: string;
  githubUrl: string;
  adminUrl: string;
  tags: string[];
  platform?: "web" | "mobile";
}

const MC_SCREENSHOTS: ScreenshotEntry[] = [
  {
    id: "dashboard",
    label: "Tableau de bord",
    description: "Vue d'ensemble des KPIs : signalements, statuts, graphiques d'évolution et derniers incidents.",
    url: "https://d2xsxph8kpxj0f.cloudfront.net/92503813/RGNGtwCyvJxe74uKiqakNB/01-dashboard_8d64143d.webp",
    sourceFile: "admin/pages/dashboard.php",
    githubUrl: "https://github.com/Tarzzan/ccds-app-citoyenne/blob/main/admin/pages/dashboard.php",
    adminUrl: "https://netetfix.com/admin/?page=dashboard",
    tags: ["KPI", "Chart.js", "PHP"],
    platform: "web",
  },
  {
    id: "incidents",
    label: "Signalements",
    description: "Liste paginée des signalements citoyens avec filtres par statut, catégorie et priorité.",
    url: "https://d2xsxph8kpxj0f.cloudfront.net/92503813/RGNGtwCyvJxe74uKiqakNB/02-signalements_7a37f9b5.webp",
    sourceFile: "admin/pages/incidents.php",
    githubUrl: "https://github.com/Tarzzan/ccds-app-citoyenne/blob/main/admin/pages/incidents.php",
    adminUrl: "https://netetfix.com/admin/?page=incidents",
    tags: ["CRUD", "Pagination", "Filtres"],
    platform: "web",
  },
  {
    id: "map",
    label: "Carte interactive",
    description: "Cartographie Leaflet.js des signalements géolocalisés avec clustering et popups détaillés.",
    url: "https://d2xsxph8kpxj0f.cloudfront.net/92503813/RGNGtwCyvJxe74uKiqakNB/03-carte_26dfb16c.webp",
    sourceFile: "admin/pages/map.php",
    githubUrl: "https://github.com/Tarzzan/ccds-app-citoyenne/blob/main/admin/pages/map.php",
    adminUrl: "https://netetfix.com/admin/?page=map",
    tags: ["Leaflet.js", "Géolocalisation", "Clustering"],
    platform: "web",
  },
  {
    id: "stats",
    label: "Statistiques",
    description: "Analyses approfondies : répartition par catégorie, temps de résolution moyen, tendances mensuelles.",
    url: "https://d2xsxph8kpxj0f.cloudfront.net/92503813/RGNGtwCyvJxe74uKiqakNB/04-statistiques_4b73773d.webp",
    sourceFile: "admin/pages/stats.php",
    githubUrl: "https://github.com/Tarzzan/ccds-app-citoyenne/blob/main/admin/pages/stats.php",
    adminUrl: "https://netetfix.com/admin/?page=stats",
    tags: ["Chart.js", "Analytics", "Tendances"],
    platform: "web",
  },
  {
    id: "realtime",
    label: "Temps réel LIVE",
    description: "Tableau de bord en temps réel avec WebSocket : activité récente, flux d'événements en direct.",
    url: "https://d2xsxph8kpxj0f.cloudfront.net/92503813/RGNGtwCyvJxe74uKiqakNB/05-temps-reel_d580d01c.webp",
    sourceFile: "admin/pages/realtime_dashboard.php",
    githubUrl: "https://github.com/Tarzzan/ccds-app-citoyenne/blob/main/admin/pages/realtime_dashboard.php",
    adminUrl: "https://netetfix.com/admin/?page=realtime_dashboard",
    tags: ["WebSocket", "Live", "Temps réel"],
    platform: "web",
  },
  {
    id: "predictive",
    label: "Analyse prédictive",
    description: "Détection de zones à risque par clustering géographique et analyse des tendances sur 6 mois.",
    url: "https://d2xsxph8kpxj0f.cloudfront.net/92503813/RGNGtwCyvJxe74uKiqakNB/06-analyse-predictive_dabe7c20.webp",
    sourceFile: "admin/pages/predictive_analysis.php",
    githubUrl: "https://github.com/Tarzzan/ccds-app-citoyenne/blob/main/admin/pages/predictive_analysis.php",
    adminUrl: "https://netetfix.com/admin/?page=predictive_analysis",
    tags: ["ML", "Clustering", "Prédiction"],
    platform: "web",
  },
  {
    id: "polls",
    label: "Sondages",
    description: "Gestion des sondages citoyens : création, publication, résultats en temps réel.",
    url: "https://d2xsxph8kpxj0f.cloudfront.net/92503813/RGNGtwCyvJxe74uKiqakNB/07-sondages_6c16586a.webp",
    sourceFile: "admin/pages/polls_admin.php",
    githubUrl: "https://github.com/Tarzzan/ccds-app-citoyenne/blob/main/admin/pages/polls_admin.php",
    adminUrl: "https://netetfix.com/admin/?page=polls",
    tags: ["Sondages", "Communauté", "Votes"],
    platform: "web",
  },
  {
    id: "events",
    label: "Événements",
    description: "Calendrier des événements municipaux avec gestion des inscriptions (RSVP) et publications.",
    url: "https://d2xsxph8kpxj0f.cloudfront.net/92503813/RGNGtwCyvJxe74uKiqakNB/08-evenements_eecd0e53.webp",
    sourceFile: "admin/pages/events_admin.php",
    githubUrl: "https://github.com/Tarzzan/ccds-app-citoyenne/blob/main/admin/pages/events_admin.php",
    adminUrl: "https://netetfix.com/admin/?page=events",
    tags: ["Événements", "RSVP", "Calendrier"],
    platform: "web",
  },
];

const MC_MOBILE_SCREENSHOTS: ScreenshotEntry[] = [
  {
    id: "mobile-login",
    label: "Connexion & Identité",
    description: "Écran de connexion sécurisé avec l'identité visuelle CCDS Guyane et dégradé vert forêt. Authentification JWT.",
    url: "https://d2xsxph8kpxj0f.cloudfront.net/92503813/RGNGtwCyvJxe74uKiqakNB/mobile_01_login_78af33b4.png",
    sourceFile: "mobile/src/screens/LoginScreen.tsx",
    githubUrl: "https://github.com/Tarzzan/ccds-app-citoyenne/blob/main/mobile/src/screens/LoginScreen.tsx",
    adminUrl: "https://netetfix.com/app/",
    tags: ["React Native", "JWT", "Expo"],
    platform: "mobile",
  },
  {
    id: "mobile-carte",
    label: "Carte Interactive",
    description: "Visualisation des signalements sur le territoire CCDS (Kourou & Sinnamary) avec clustering et popups natifs.",
    url: "https://d2xsxph8kpxj0f.cloudfront.net/92503813/RGNGtwCyvJxe74uKiqakNB/mobile_02_carte_ad8f77f7.png",
    sourceFile: "mobile/src/screens/MapScreen.tsx",
    githubUrl: "https://github.com/Tarzzan/ccds-app-citoyenne/blob/main/mobile/src/screens/MapScreen.tsx",
    adminUrl: "https://netetfix.com/app/",
    tags: ["React Native Maps", "Géolocalisation", "Clustering"],
    platform: "mobile",
  },
  {
    id: "mobile-creation",
    label: "Créer un Signalement",
    description: "Formulaire ultra-rapide avec géolocalisation automatique, sélection de catégorie et upload photo.",
    url: "https://d2xsxph8kpxj0f.cloudfront.net/92503813/RGNGtwCyvJxe74uKiqakNB/mobile_03_creation_ea2889ef.png",
    sourceFile: "mobile/src/screens/CreateIncidentScreen.tsx",
    githubUrl: "https://github.com/Tarzzan/ccds-app-citoyenne/blob/main/mobile/src/screens/CreateIncidentScreen.tsx",
    adminUrl: "https://netetfix.com/app/",
    tags: ["Formulaire", "GPS", "Upload photo"],
    platform: "mobile",
  },
  {
    id: "mobile-mes-signalements",
    label: "Mes Signalements",
    description: "Suivi personnalisé de l'avancement des demandes citoyennes avec badges de statut et historique.",
    url: "https://d2xsxph8kpxj0f.cloudfront.net/92503813/RGNGtwCyvJxe74uKiqakNB/mobile_04_mes_signalements_f75959b7.png",
    sourceFile: "mobile/src/screens/MyIncidentsScreen.tsx",
    githubUrl: "https://github.com/Tarzzan/ccds-app-citoyenne/blob/main/mobile/src/screens/MyIncidentsScreen.tsx",
    adminUrl: "https://netetfix.com/app/",
    tags: ["Liste", "Statuts", "Suivi citoyen"],
    platform: "mobile",
  },
  {
    id: "mobile-detail",
    label: "Détail & Transparence",
    description: "Historique complet du signalement avec dialogue citoyen-agent, photos et timeline de traitement.",
    url: "https://d2xsxph8kpxj0f.cloudfront.net/92503813/RGNGtwCyvJxe74uKiqakNB/mobile_05_detail_b4e060f3.png",
    sourceFile: "mobile/src/screens/IncidentDetailScreen.tsx",
    githubUrl: "https://github.com/Tarzzan/ccds-app-citoyenne/blob/main/mobile/src/screens/IncidentDetailScreen.tsx",
    adminUrl: "https://netetfix.com/app/",
    tags: ["Détail", "Timeline", "Chat citoyen"],
    platform: "mobile",
  },
];

// ─── Couleurs éléments ────────────────────────────────────────────────────────

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

// ─── Composant carte screenshot ───────────────────────────────────────────────

function ScreenshotCard({
  sc,
  selected,
  onSelect,
  onLoad,
  mobileStyle = false,
}: {
  sc: ScreenshotEntry;
  selected: boolean;
  onSelect: (sc: ScreenshotEntry | null) => void;
  onLoad: (sc: ScreenshotEntry) => void;
  mobileStyle?: boolean;
}) {
  return (
    <div
      className={cn(
        "group rounded-xl border overflow-hidden cursor-pointer transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5",
        selected
          ? mobileStyle
            ? "border-violet-400/50 ring-1 ring-violet-400/30"
            : "border-pink-400/50 ring-1 ring-pink-400/30"
          : "border-border"
      )}
      onClick={() => onSelect(selected ? null : sc)}
    >
      {/* Thumbnail */}
      <div className={cn(
        "relative bg-secondary/30 overflow-hidden",
        mobileStyle ? "aspect-[9/16] max-h-56" : "aspect-video"
      )}>
        <img
          src={sc.url}
          alt={sc.label}
          className="w-full h-full object-cover object-top transition-transform group-hover:scale-105"
          loading="lazy"
        />
        {/* Badge plateforme */}
        <div className={cn(
          "absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold",
          mobileStyle
            ? "bg-violet-500/80 text-white"
            : "bg-emerald-500/80 text-white"
        )}>
          {mobileStyle ? <Smartphone className="w-2.5 h-2.5" /> : <Monitor className="w-2.5 h-2.5" />}
          {mobileStyle ? "Mobile" : "Web"}
        </div>
        {/* Overlay actions */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onLoad(sc); }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-white text-xs font-medium rounded-lg transition-colors",
              mobileStyle ? "bg-violet-500 hover:bg-violet-400" : "bg-pink-500 hover:bg-pink-400"
            )}
          >
            <Code2 className="w-3 h-3" />
            Analyser
          </button>
          <a
            href={sc.adminUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-medium rounded-lg transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            Live
          </a>
        </div>
      </div>

      {/* Info */}
      <div className="p-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">{sc.label}</p>
          <ChevronRight className={cn(
            "w-3.5 h-3.5 text-muted-foreground transition-transform",
            selected ? "rotate-90 text-pink-400" : ""
          )} />
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
          {sc.description}
        </p>
        <div className="flex flex-wrap gap-1 pt-0.5">
          {sc.tags.map((tag) => (
            <span key={tag} className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

type TabType = "gallery" | "analyze";
type GalleryFilter = "all" | "web" | "mobile";

export default function UICode() {
  const { data: projectList = [] } = trpc.projects.list.useQuery();
  const activeProject = projectList[0];

  const [activeTab, setActiveTab] = useState<TabType>("gallery");
  const [selectedScreenshot, setSelectedScreenshot] = useState<ScreenshotEntry | null>(null);
  const [galleryFilter, setGalleryFilter] = useState<GalleryFilter>("all");

  const allScreenshots = [...MC_SCREENSHOTS, ...MC_MOBILE_SCREENSHOTS];
  const filteredScreenshots = galleryFilter === "all"
    ? allScreenshots
    : allScreenshots.filter((s) => s.platform === galleryFilter);

  // Analyze tab state
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [elements, setElements] = useState<UiElement[]>([]);
  const [activeScreenLabel, setActiveScreenLabel] = useState<string>("");
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
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setImageUrl(dataUrl);
        setElements([]);
        setCodeMatches([]);
        setSelectedElement(null);
        toast.success("Image chargée, prête pour l'analyse");
      };
      reader.readAsDataURL(file);
    } catch {
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
      screenLabel: activeScreenLabel || undefined,
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

  // Charger un screenshot Ma Commune dans l'onglet Analyser
  const handleLoadScreenshot = (screenshot: ScreenshotEntry) => {
    setImageUrl(screenshot.url);
    setActiveScreenLabel(screenshot.label);
    setElements([]);
    setCodeMatches([]);
    setSelectedElement(null);
    setActiveTab("analyze");
    toast.success(`Screenshot "${screenshot.label}" chargé pour analyse`);
  };

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
            Galerie des interfaces Ma Commune · Analyse IA screenshot → code source
          </p>
        </div>
        <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-1">
          <button
            onClick={() => setActiveTab("gallery")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
              activeTab === "gallery"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Layout className="w-3.5 h-3.5" />
            Galerie ({allScreenshots.length})
          </button>
          <button
            onClick={() => setActiveTab("analyze")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
              activeTab === "analyze"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Code2 className="w-3.5 h-3.5" />
            Analyser
          </button>
        </div>
      </div>

      {/* ── ONGLET GALERIE ──────────────────────────────────────────────────── */}
      {activeTab === "gallery" && (
        <div className="flex flex-1 overflow-hidden">
          {/* Grille de screenshots */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Bannière projet */}
            <div className="flex items-center justify-between mb-4 px-4 py-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-lg">🏛️</div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Ma Commune — CCDS App Citoyenne</p>
                  <p className="text-xs text-muted-foreground">
                    <a
                      href="https://github.com/Tarzzan/ccds-app-citoyenne"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-emerald-400 transition-colors"
                    >
                      github.com/Tarzzan/ccds-app-citoyenne
                    </a>
                    {" · "}
                    <a
                      href="https://netetfix.com/admin"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-emerald-400 transition-colors"
                    >
                      netetfix.com/admin
                    </a>
                  </p>
                </div>
              </div>
              <a
                href="https://netetfix.com/admin"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                <Globe className="w-3.5 h-3.5" />
                Ouvrir l'admin
              </a>
            </div>

            {/* Filtres plateforme */}
            <div className="flex items-center gap-2 mb-5">
              {(
                [
                  { key: "all" as const, label: `Tout (${allScreenshots.length})`, icon: null },
                  { key: "web" as const, label: `Admin Web (${MC_SCREENSHOTS.length})`, icon: Monitor },
                  { key: "mobile" as const, label: `Mobile React Native (${MC_MOBILE_SCREENSHOTS.length})`, icon: Smartphone },
                ]
              ).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setGalleryFilter(key)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                    galleryFilter === key
                      ? key === "mobile"
                        ? "bg-violet-500/15 border-violet-500/40 text-violet-300"
                        : key === "web"
                        ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                        : "bg-primary/15 border-primary/40 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
                  )}
                >
                  {Icon && <Icon className="w-3 h-3" />}
                  {label}
                </button>
              ))}
            </div>

            {/* Affichage par sections (filtre = all) */}
            {galleryFilter === "all" && (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <Monitor className="w-3.5 h-3.5 text-emerald-400" />
                  <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">Back-Office Web</p>
                  <div className="flex-1 h-px bg-emerald-500/20" />
                </div>
                <div className="grid grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
                  {MC_SCREENSHOTS.map((sc) => (
                    <ScreenshotCard
                      key={sc.id}
                      sc={sc}
                      selected={selectedScreenshot?.id === sc.id}
                      onSelect={setSelectedScreenshot}
                      onLoad={handleLoadScreenshot}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <Smartphone className="w-3.5 h-3.5 text-violet-400" />
                  <p className="text-xs font-semibold text-violet-400 uppercase tracking-wide">Application Mobile React Native</p>
                  <div className="flex-1 h-px bg-violet-500/20" />
                </div>
                <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                  {MC_MOBILE_SCREENSHOTS.map((sc) => (
                    <ScreenshotCard
                      key={sc.id}
                      sc={sc}
                      selected={selectedScreenshot?.id === sc.id}
                      onSelect={setSelectedScreenshot}
                      onLoad={handleLoadScreenshot}
                      mobileStyle
                    />
                  ))}
                </div>
              </>
            )}

            {/* Affichage filtré */}
            {galleryFilter !== "all" && (
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredScreenshots.map((sc) => (
                  <ScreenshotCard
                    key={sc.id}
                    sc={sc}
                    selected={selectedScreenshot?.id === sc.id}
                    onSelect={setSelectedScreenshot}
                    onLoad={handleLoadScreenshot}
                    mobileStyle={sc.platform === "mobile"}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Panneau détail */}
          {selectedScreenshot && (
            <div className="w-80 border-l border-border flex flex-col shrink-0 overflow-y-auto">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Détails
                </p>
                <button
                  onClick={() => setSelectedScreenshot(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="p-4 space-y-4">
                {/* Preview */}
                <img
                  src={selectedScreenshot.url}
                  alt={selectedScreenshot.label}
                  className={cn(
                    "w-full rounded-lg border border-border",
                    selectedScreenshot.platform === "mobile" ? "max-h-64 object-contain" : ""
                  )}
                />

                {/* Titre + badge plateforme */}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-sm">{selectedScreenshot.label}</h3>
                    <span className={cn(
                      "flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded",
                      selectedScreenshot.platform === "mobile"
                        ? "bg-violet-500/20 text-violet-300"
                        : "bg-emerald-500/20 text-emerald-300"
                    )}>
                      {selectedScreenshot.platform === "mobile"
                        ? <><Smartphone className="w-2.5 h-2.5" /> Mobile</>
                        : <><Monitor className="w-2.5 h-2.5" /> Web</>
                      }
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {selectedScreenshot.description}
                  </p>
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-1">
                  {selectedScreenshot.tags.map((tag) => (
                    <span key={tag} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border">
                      {tag}
                    </span>
                  ))}
                </div>

                {/* Liens */}
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                    Liens
                  </p>
                  <a
                    href={selectedScreenshot.githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/40 hover:bg-secondary/70 transition-colors text-xs"
                  >
                    <FileCode className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                    <span className="truncate font-mono text-violet-400">{selectedScreenshot.sourceFile}</span>
                    <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0 ml-auto" />
                  </a>
                  <a
                    href={selectedScreenshot.adminUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/40 hover:bg-secondary/70 transition-colors text-xs"
                  >
                    <Globe className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="truncate text-emerald-400">
                      {selectedScreenshot.platform === "mobile" ? "Ouvrir l'app web" : "Ouvrir dans l'admin"}
                    </span>
                    <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0 ml-auto" />
                  </a>
                </div>

                {/* Action analyser */}
                <Button
                  className="w-full"
                  size="sm"
                  onClick={() => handleLoadScreenshot(selectedScreenshot)}
                >
                  <Code2 className="w-3.5 h-3.5 mr-2" />
                  Analyser avec IA
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ONGLET ANALYSER ─────────────────────────────────────────────────── */}
      {activeTab === "analyze" && (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Sub-header */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-secondary/20 shrink-0">
            <p className="text-xs text-muted-foreground">
              {imageUrl
                ? "Screenshot chargé — cliquez sur Analyser pour détecter les éléments UI"
                : "Chargez un screenshot ou sélectionnez-en un depuis la Galerie"}
            </p>
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
                    <p className="text-sm text-muted-foreground">PNG, JPG, WebP — ou sélectionnez depuis la Galerie</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setActiveTab("gallery"); }}
                    className="text-xs text-pink-400 hover:text-pink-300 transition-colors flex items-center gap-1"
                  >
                    <Layout className="w-3 h-3" />
                    Voir la galerie Ma Commune
                  </button>
                </div>
              ) : (
                <div className="relative inline-block">
                  <img
                    src={imageUrl}
                    alt="Screenshot analysé"
                    className="max-w-full rounded-xl border border-border"
                    style={{ display: "block" }}
                  />
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
                  <div className="bg-secondary/50 rounded-lg px-3 py-2 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border", ELEMENT_LABEL_COLORS[selectedElement.type] ?? ELEMENT_LABEL_COLORS.other)}>
                        {selectedElement.type}
                      </span>
                      <span className="text-xs truncate flex-1">{selectedElement.label}</span>
                      <button onClick={() => setSelectedElement(null)} className="ml-auto text-muted-foreground hover:text-foreground">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    {selectedElement.sourceFile && (
                      <div className="flex items-center gap-1.5">
                        <FileCode className="w-3 h-3 text-violet-400 shrink-0" />
                        <span className="text-[10px] font-mono text-violet-400 truncate">{selectedElement.sourceFile}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

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
                          className="w-full flex flex-col gap-0.5 px-3 py-2 rounded-lg bg-secondary/30 hover:bg-secondary/60 transition-colors text-left"
                        >
                          <div className="flex items-center gap-2">
                            <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0", ELEMENT_LABEL_COLORS[el.type] ?? ELEMENT_LABEL_COLORS.other)}>
                              {el.type}
                            </span>
                            <span className="text-xs truncate">{el.label}</span>
                          </div>
                          {el.sourceFile && (
                            <span className="text-[9px] font-mono text-violet-400 truncate pl-1">{el.sourceFile}</span>
                          )}
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
      )}
    </div>
  );
}
