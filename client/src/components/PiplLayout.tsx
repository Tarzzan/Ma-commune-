import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect, useState as useStateTimeout } from "react";
import { cn } from "@/lib/utils";
import {
  Activity,
  Brain,
  ChevronRight,
  Cpu,
  Eye,
  FileText,
  FolderOpen,
  GitCompare,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Moon,
  Settings,
  Shield,
  Smartphone,
  Sun,
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const navItems = [
  { path: "/", icon: LayoutDashboard, label: "Tableau de bord", color: "text-blue-400" },
  { path: "/config", icon: Settings, label: "Configuration", color: "text-slate-400" },
  { path: "/architecture", icon: Cpu, label: "Architecture", color: "text-violet-400" },
  { path: "/journal", icon: Activity, label: "Journal", color: "text-green-400" },
  { path: "/adr", icon: Shield, label: "Décisions (ADR)", color: "text-yellow-400" },
  { path: "/ui-code", icon: Eye, label: "Pont UI-Code", color: "text-pink-400" },
  { path: "/ideas", icon: Brain, label: "Arbre des Idées", color: "text-orange-400" },
  { path: "/report", icon: FileText, label: "Rapport PDF", color: "text-cyan-400" },
  { path: "/arch-diff", icon: GitCompare, label: "Comparaison", color: "text-teal-400" },
  { path: "/mobile", icon: Smartphone, label: "Mobile", color: "text-purple-400" },
];

function NavItem({ item, collapsed }: { item: typeof navItems[0]; collapsed: boolean }) {
  const [location] = useLocation();
  const isActive = location === item.path;

  const content = (
    <Link href={item.path}>
      <div
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 cursor-pointer group",
          isActive
            ? "bg-primary/15 text-primary"
            : "text-muted-foreground hover:bg-secondary hover:text-foreground"
        )}
      >
        <item.icon
          className={cn("shrink-0 w-4 h-4", isActive ? "text-primary" : item.color)}
        />
        {!collapsed && (
          <span className="text-sm font-medium truncate">{item.label}</span>
        )}
        {!collapsed && isActive && (
          <ChevronRight className="ml-auto w-3 h-3 text-primary" />
        )}
      </div>
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  }
  return content;
}

export default function PiplLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [timedOut, setTimedOut] = useStateTimeout(false);
  const [collapsed, setCollapsed] = useState(false);
  const { theme, toggleTheme, switchable } = useTheme();
  const { data: projectList = [] } = trpc.projects.list.useQuery(undefined, { enabled: isAuthenticated });
  const activeProject = projectList.find(p => p.isActive) ?? projectList[0];
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => { window.location.href = "/login"; },
  });

  // Timeout de sécurité : si l'OAuth Manus ne répond pas en 2s, on considère non-authentifié
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 2000);
    return () => clearTimeout(t);
  }, []);

  const loading = authLoading && !timedOut;

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Chargement…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Rediriger vers la page de connexion locale
    window.location.href = "/login";
    return null;
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* ── Sidebar ── */}
      <aside
        className={cn(
          "flex flex-col border-r border-border bg-card transition-all duration-200 shrink-0",
          collapsed ? "w-[60px]" : "w-[220px]"
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-3 py-4 border-b border-border">
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <GitBranch className="w-4 h-4 text-primary" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-bold gradient-text leading-none">PIPL</p>
              <p className="text-[10px] text-muted-foreground truncate mt-0.5">Intelligence Projet</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {navItems.map((item) => (
            <NavItem key={item.path} item={item} collapsed={collapsed} />
          ))}
        </nav>

        {/* Project indicator */}
        {!collapsed && (
          <div className="px-3 py-2 border-t border-border">
            <Link href="/config">
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-secondary/50 hover:bg-secondary cursor-pointer transition-colors">
                <FolderOpen className={`w-3 h-3 shrink-0 ${activeProject ? 'text-green-400' : 'text-muted-foreground'}`} />
                {activeProject ? (
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground truncate leading-tight">{activeProject.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate font-mono leading-tight">{activeProject.localPath.split('/').pop()}</p>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground truncate">Aucun projet actif</span>
                )}
              </div>
            </Link>
          </div>
        )}

        {/* User */}
        <div className="p-2 border-t border-border">
          <div className={cn("flex items-center gap-2 px-2 py-1.5 rounded-lg", collapsed ? "justify-center" : "")}>
            <Avatar className="w-6 h-6 shrink-0">
              <AvatarFallback className="text-[10px] bg-primary/20 text-primary">
                {user?.name?.[0]?.toUpperCase() ?? "U"}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <>
                <span className="text-xs text-muted-foreground truncate flex-1">{user?.name ?? "Utilisateur"}</span>
                <button
                  onClick={() => logout.mutate()}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <LogOut className="w-3 h-3" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Bascule thème */}
        {switchable && toggleTheme && (
          <div className="px-2 pb-1">
            <button
              onClick={toggleTheme}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-all duration-150",
                collapsed ? "justify-center" : ""
              )}
              title={theme === "light" ? "Passer en mode sombre" : "Passer en mode clair"}
            >
              {theme === "light" ? (
                <Moon className="w-4 h-4 shrink-0" />
              ) : (
                <Sun className="w-4 h-4 shrink-0" />
              )}
              {!collapsed && (
                <span className="text-xs font-medium">
                  {theme === "light" ? "Mode sombre" : "Mode clair"}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Toggle sidebar */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute left-0 bottom-20 translate-x-full -translate-y-1/2 w-5 h-10 bg-card border border-border rounded-r-md flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          style={{ position: "relative", margin: "0 auto 8px" }}
        >
          <ChevronRight className={cn("w-3 h-3 transition-transform", collapsed ? "" : "rotate-180")} />
        </button>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
