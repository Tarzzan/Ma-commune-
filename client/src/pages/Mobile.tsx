import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `il y a ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `il y a ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `il y a ${days}j`;
}

function platformIcon(platform: string) {
  return platform === "IOS" ? "🍎" : "🤖";
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    FINISHED: { label: "✅ Succès", className: "bg-green-900/50 text-green-300 border-green-700" },
    ERRORED: { label: "❌ Erreur", className: "bg-red-900/50 text-red-300 border-red-700" },
    IN_QUEUE: { label: "⏳ File d'attente", className: "bg-yellow-900/50 text-yellow-300 border-yellow-700" },
    IN_PROGRESS: { label: "🔄 En cours", className: "bg-blue-900/50 text-blue-300 border-blue-700" },
    CANCELED: { label: "⛔ Annulé", className: "bg-gray-700/50 text-gray-400 border-gray-600" },
  };
  const s = map[status] ?? { label: status, className: "bg-gray-700 text-gray-300 border-gray-600" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${s.className}`}>
      {s.label}
    </span>
  );
}

function ConnectionCard({
  title,
  icon,
  connected,
  detail,
  error,
}: {
  title: string;
  icon: string;
  connected: boolean;
  detail: string;
  error?: string | null;
}) {
  return (
    <Card className={`border ${connected ? "border-green-700 bg-green-950/30" : "border-red-700 bg-red-950/30"}`}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white">{title}</span>
              <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-400" : "bg-red-400"}`} />
              <span className={`text-xs ${connected ? "text-green-400" : "text-red-400"}`}>
                {connected ? "Connecté" : "Non connecté"}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5 truncate">{detail}</p>
            {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function Mobile() {
  const [activeTab, setActiveTab] = useState("overview");

  const { data: check, isLoading: checkLoading, refetch: refetchCheck } =
    trpc.mobile.connectionCheck.useQuery(undefined, { refetchOnWindowFocus: false });

  const { data: expo, isLoading: expoLoading, refetch: refetchExpo } =
    trpc.mobile.expoStatus.useQuery(undefined, {
      enabled: activeTab === "expo" || activeTab === "overview",
      refetchOnWindowFocus: false,
    });

  const { data: apple, isLoading: appleLoading, refetch: refetchApple } =
    trpc.mobile.appleStatus.useQuery(undefined, {
      enabled: activeTab === "apple" || activeTab === "overview",
      refetchOnWindowFocus: false,
    });

  const [newAppId, setNewAppId] = useState("");
  const [savingAppId, setSavingAppId] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const saveCredentials = trpc.mobile.saveCredentials.useMutation();

  const handleSaveAppId = async () => {
    if (!newAppId.trim()) return;
    setSavingAppId(true);
    setSaveMsg("");
    try {
      await saveCredentials.mutateAsync({ expoAppId: newAppId.trim() });
      setSaveMsg("✅ App ID mis à jour — rechargez pour voir les builds");
      setNewAppId("");
      setTimeout(() => { refetchExpo(); refetchCheck(); }, 1500);
    } catch {
      setSaveMsg("❌ Erreur lors de la mise à jour");
    } finally {
      setSavingAppId(false);
    }
  };

  const handleRefresh = () => {
    refetchCheck();
    refetchExpo();
    refetchApple();
  };

  // Stats builds
  const successCount = expo?.builds?.filter((b) => b.status === "FINISHED").length ?? 0;
  const errorCount = expo?.builds?.filter((b) => b.status === "ERRORED").length ?? 0;
  const inProgressCount = expo?.builds?.filter((b) => b.status === "IN_PROGRESS" || b.status === "IN_QUEUE").length ?? 0;
  const androidBuilds = expo?.builds?.filter((b) => b.platform === "ANDROID") ?? [];
  const iosBuilds = expo?.builds?.filter((b) => b.platform === "IOS") ?? [];

  return (
    <div className="p-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              📱 Développement Mobile
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              Monitoring Expo EAS · Apple App Store Connect · CCDS Citoyen
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={checkLoading || expoLoading || appleLoading}
            className="border-gray-600 text-gray-300 hover:bg-gray-700"
          >
            {checkLoading || expoLoading || appleLoading ? "⟳ Actualisation..." : "⟳ Actualiser"}
          </Button>
        </div>

        {/* Mise à jour App ID Expo */}
        <div className="mb-4 p-3 bg-gray-800/60 border border-gray-700 rounded-lg">
          <p className="text-xs text-gray-400 mb-2">🔧 Mettre à jour l'Expo App ID (projet EAS actif)</p>
          <div className="flex gap-2">
            <Input
              value={newAppId}
              onChange={(e) => setNewAppId(e.target.value)}
              placeholder="UUID du projet EAS (ex: b3d38760-9ace-47eb-b84f-37419e550824)"
              className="bg-gray-900 border-gray-600 text-white text-xs h-8 flex-1"
            />
            <Button
              size="sm"
              onClick={handleSaveAppId}
              disabled={savingAppId || !newAppId.trim()}
              className="bg-blue-700 hover:bg-blue-600 text-white h-8 text-xs whitespace-nowrap"
            >
              {savingAppId ? "..." : "Sauvegarder"}
            </Button>
          </div>
          {saveMsg && <p className="text-xs mt-1 text-gray-300">{saveMsg}</p>}
        </div>
        {/* Connexions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <ConnectionCard
            title="Expo EAS"
            icon="⚡"
            connected={check?.expo?.connected ?? false}
            detail={
              check?.expo?.connected
                ? `@${check.expo.username} · ${expo?.appName ?? "ccds-app-citoyenne"}`
                : "Token non configuré ou invalide"
            }
            error={check?.expo?.error}
          />
          <ConnectionCard
            title="Apple App Store Connect"
            icon="🍎"
            connected={check?.apple?.connected ?? false}
            detail={
              check?.apple?.connected
                ? `${check.apple.appsCount} app(s) sur l'App Store Connect`
                : "Aucune app soumise sur l'App Store"
            }
            error={check?.apple?.error}
          />
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-gray-800 border border-gray-700 mb-6">
            <TabsTrigger value="overview" className="data-[state=active]:bg-gray-700 text-gray-300">
              Vue d'ensemble
            </TabsTrigger>
            <TabsTrigger value="expo" className="data-[state=active]:bg-gray-700 text-gray-300">
              ⚡ Expo EAS Builds
            </TabsTrigger>
            <TabsTrigger value="apple" className="data-[state=active]:bg-gray-700 text-gray-300">
              🍎 Apple Store
            </TabsTrigger>
          </TabsList>

          {/* ── Vue d'ensemble ── */}
          <TabsContent value="overview">
            {expoLoading ? (
              <div className="text-gray-400 text-center py-12">Chargement des données Expo...</div>
            ) : expo?.connected ? (
              <>
                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  {[
                    { label: "Total builds", value: expo.totalBuilds, color: "text-white" },
                    { label: "Succès", value: successCount, color: "text-green-400" },
                    { label: "Erreurs", value: errorCount, color: "text-red-400" },
                    { label: "En cours", value: inProgressCount, color: "text-blue-400" },
                  ].map((s) => (
                    <Card key={s.label} className="bg-gray-800 border-gray-700">
                      <CardContent className="pt-4 pb-3 text-center">
                        <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
                        <div className="text-xs text-gray-400 mt-1">{s.label}</div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Dernier build */}
                {expo.builds.length > 0 && (
                  <Card className="bg-gray-800 border-gray-700 mb-6">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-gray-300">Dernier build</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{platformIcon(expo.builds[0].platform)}</span>
                          <div>
                            <div className="text-white font-medium">
                              {expo.builds[0].platform} · v{expo.builds[0].appVersion}
                            </div>
                            <div className="text-xs text-gray-400">
                              Profil: <span className="text-gray-300">{expo.builds[0].buildProfile}</span>
                              {" · "}
                              {timeAgo(expo.builds[0].createdAt)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {statusBadge(expo.builds[0].status)}
                          {expo.builds[0].buildUrl && (
                            <a
                              href={expo.builds[0].buildUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-400 hover:underline"
                            >
                              ⬇ Télécharger
                            </a>
                          )}
                        </div>
                      </div>
                      {expo.builds[0].errorMessage && (
                        <Alert className="mt-3 bg-red-950/30 border-red-800">
                          <AlertDescription className="text-red-300 text-xs">
                            <strong>{expo.builds[0].errorCode}</strong>: {expo.builds[0].errorMessage}
                          </AlertDescription>
                        </Alert>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Android vs iOS */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { label: "🤖 Android", builds: androidBuilds },
                    { label: "🍎 iOS", builds: iosBuilds },
                  ].map(({ label, builds }) => (
                    <Card key={label} className="bg-gray-800 border-gray-700">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-gray-300">{label}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {builds.length === 0 ? (
                          <p className="text-gray-500 text-sm">Aucun build</p>
                        ) : (
                          <div className="space-y-2">
                            {builds.slice(0, 5).map((b) => (
                              <div
                                key={b.id}
                                className="flex items-center justify-between text-xs py-1 border-b border-gray-700 last:border-0"
                              >
                                <span className="text-gray-300">
                                  v{b.appVersion} · {b.buildProfile}
                                </span>
                                <div className="flex items-center gap-2">
                                  {statusBadge(b.status)}
                                  <span className="text-gray-500">{timeAgo(b.createdAt)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            ) : (
              <Alert className="bg-red-950/30 border-red-800">
                <AlertDescription className="text-red-300">
                  {expo?.error ?? "Connexion Expo impossible"}
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>

          {/* ── Expo EAS Builds ── */}
          <TabsContent value="expo">
            {expoLoading ? (
              <div className="text-gray-400 text-center py-12">Chargement des builds EAS...</div>
            ) : expo?.connected ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-gray-400 text-sm">
                    {expo.totalBuilds} builds · compte{" "}
                    <span className="text-white">@{expo.username}</span>
                    {" · app "}
                    <span className="text-white">{expo.appName}</span>
                  </span>
                </div>
                {expo.builds.map((b) => (
                  <Card key={b.id} className="bg-gray-800 border-gray-700">
                    <CardContent className="pt-4 pb-3">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{platformIcon(b.platform)}</span>
                          <div>
                            <div className="text-white text-sm font-medium">
                              {b.platform} · v{b.appVersion}
                              <span className="ml-2 text-xs text-gray-400">({b.buildProfile})</span>
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              Créé {timeAgo(b.createdAt)}
                              {b.completedAt && ` · Terminé ${timeAgo(b.completedAt)}`}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {statusBadge(b.status)}
                          {b.buildUrl && (
                            <a
                              href={b.buildUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-400 hover:underline border border-blue-700 px-2 py-0.5 rounded"
                            >
                              ⬇ APK/IPA
                            </a>
                          )}
                          {b.logFiles.length > 0 && (
                            <a
                              href={b.logFiles[0]}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-gray-400 hover:underline border border-gray-600 px-2 py-0.5 rounded"
                            >
                              📋 Logs
                            </a>
                          )}
                        </div>
                      </div>
                      {b.errorMessage && (
                        <Alert className="mt-2 bg-red-950/30 border-red-800 py-2">
                          <AlertDescription className="text-red-300 text-xs">
                            <strong>{b.errorCode}</strong>: {b.errorMessage}
                          </AlertDescription>
                        </Alert>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Alert className="bg-red-950/30 border-red-800">
                <AlertDescription className="text-red-300">
                  {expo?.error ?? "Connexion Expo impossible"}
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>

          {/* ── Apple App Store ── */}
          <TabsContent value="apple">
            {appleLoading ? (
              <div className="text-gray-400 text-center py-12">Chargement des données Apple...</div>
            ) : apple?.connected ? (
              <div className="space-y-4">
                {apple.apps.length === 0 ? (
                  <Card className="bg-gray-800 border-gray-700">
                    <CardContent className="pt-6 pb-5 text-center">
                      <div className="text-4xl mb-3">🍎</div>
                      <p className="text-white font-medium">Compte Apple Developer connecté</p>
                      <p className="text-gray-400 text-sm mt-2">
                        Aucune app encore soumise sur l'App Store Connect.
                        <br />
                        Créez votre app sur{" "}
                        <a
                          href="https://appstoreconnect.apple.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:underline"
                        >
                          appstoreconnect.apple.com
                        </a>{" "}
                        pour commencer.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  apple.apps.map((app) => (
                    <Card key={app.id} className="bg-gray-800 border-gray-700">
                      <CardContent className="pt-4 pb-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-white font-medium">{app.name}</div>
                            <div className="text-xs text-gray-400 mt-0.5">{app.bundleId}</div>
                          </div>
                          <Badge variant="outline" className="border-gray-600 text-gray-300">
                            {app.appStoreState ?? "Non publié"}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}

                {/* TestFlight */}
                {apple.testflightBuilds && apple.testflightBuilds.length > 0 && (
                  <Card className="bg-gray-800 border-gray-700">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-gray-300">🧪 TestFlight Builds</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {apple.testflightBuilds.map((b: any) => (
                          <div
                            key={b.id}
                            className="flex items-center justify-between text-xs py-1 border-b border-gray-700 last:border-0"
                          >
                            <span className="text-gray-300">v{b.version}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-gray-400">{b.processingState}</span>
                              <span className="text-gray-500">{b.uploadedDate ? timeAgo(b.uploadedDate) : ""}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <Card className="bg-gray-800 border-gray-700">
                <CardContent className="pt-6 pb-5 text-center">
                  <div className="text-4xl mb-3">🍎</div>
                  <p className="text-white font-medium">Apple App Store Connect</p>
                  <p className="text-gray-400 text-sm mt-2">
                    {apple?.error ?? "Connexion impossible"}
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
    </div>
  );
}
