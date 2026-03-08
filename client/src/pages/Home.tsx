import { useState } from "react";
import { Loader2, GitBranch, Lock, Mail, Eye, EyeOff, AlertCircle, User } from "lucide-react";
import { trpc } from "@/lib/trpc";

// Page de connexion locale — thème clair cohérent avec PiplLayout
export default function Home() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: hasAdminData } = trpc.auth.hasAdmin.useQuery(undefined, {
    retry: 1,
    retryDelay: 500,
  });
  const isSetupMode = hasAdminData === false;

  const loginMutation = trpc.auth.localLogin.useMutation({
    onSuccess: () => { window.location.href = "/"; },
    onError: (err) => { setError(err.message || "Identifiants invalides"); },
  });

  const setupMutation = trpc.auth.setupAdmin.useMutation({
    onSuccess: () => { window.location.href = "/"; },
    onError: (err) => { setError(err.message || "Erreur lors de la création du compte"); },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (isSetupMode) {
      if (password !== confirmPassword) { setError("Les mots de passe ne correspondent pas"); return; }
      if (password.length < 8) { setError("Le mot de passe doit contenir au moins 8 caractères"); return; }
      setupMutation.mutate({ name, email, password });
    } else {
      loginMutation.mutate({ email, password });
    }
  };

  const isPending = loginMutation.isPending || setupMutation.isPending;

  /* ── styles inline utilisant les mêmes valeurs que le thème clair ── */
  const bg = "#f7f8fc";          // --background
  const cardBg = "#ffffff";      // --card
  const border = "#e2e6f0";      // --border
  const textPrimary = "#1a1f36"; // --foreground
  const textMuted = "#64748b";   // --muted-foreground
  const inputBg = "#f1f4fb";     // --input
  const accent = "#4f46e5";      // indigo-600 (--primary)
  const accentHover = "#4338ca";

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px 10px 36px",
    background: inputBg,
    border: `1px solid ${border}`,
    borderRadius: 8,
    color: textPrimary,
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    color: textPrimary,
    fontSize: 13,
    fontWeight: 500,
    marginBottom: 6,
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: bg,
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      {/* Arrière-plan décoratif — cercles doux */}
      <div style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        <div style={{ position: "absolute", top: -120, left: -120, width: 360, height: 360, background: "rgba(79,70,229,0.06)", borderRadius: "50%", filter: "blur(80px)" }} />
        <div style={{ position: "absolute", bottom: -120, right: -120, width: 360, height: 360, background: "rgba(139,92,246,0.06)", borderRadius: "50%", filter: "blur(80px)" }} />
        <div style={{ position: "absolute", top: "40%", left: "60%", width: 200, height: 200, background: "rgba(99,102,241,0.04)", borderRadius: "50%", filter: "blur(60px)" }} />
      </div>

      <div style={{ position: "relative", zIndex: 10, width: "100%", maxWidth: 420, padding: "0 16px" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 64, height: 64, borderRadius: 16,
            background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
            marginBottom: 16,
            boxShadow: "0 8px 24px rgba(79,70,229,0.25)",
          }}>
            <GitBranch size={32} color="white" />
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: textPrimary, margin: 0 }}>PIPL</h1>
          <p style={{ color: textMuted, marginTop: 4, fontSize: 14 }}>
            Plateforme d'Intelligence de Projet Locale
          </p>
        </div>

        {/* Carte */}
        <div style={{
          background: cardBg,
          border: `1px solid ${border}`,
          borderRadius: 14,
          padding: 32,
          boxShadow: "0 4px 24px rgba(79,70,229,0.08), 0 1px 4px rgba(0,0,0,0.06)",
        }}>
          <h2 style={{ color: textPrimary, fontSize: 20, fontWeight: 600, margin: "0 0 6px" }}>
            {isSetupMode ? "Créer votre compte administrateur" : "Connexion"}
          </h2>
          <p style={{ color: textMuted, fontSize: 14, margin: "0 0 24px" }}>
            {isSetupMode
              ? "Premier lancement — configurez votre accès à la PIPL"
              : "Accédez à votre tableau de bord de gestion de projet"}
          </p>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {isSetupMode && (
              <div>
                <label style={labelStyle}>Nom complet</label>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: textMuted, display: "flex" }}>
                    <User size={16} />
                  </span>
                  <input type="text" placeholder="Votre nom" value={name} onChange={e => setName(e.target.value)} required style={inputStyle} />
                </div>
              </div>
            )}

            <div>
              <label style={labelStyle}>Adresse email</label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: textMuted, display: "flex" }}>
                  <Mail size={16} />
                </span>
                <input type="email" placeholder="admin@exemple.com" value={email} onChange={e => setEmail(e.target.value)} required style={inputStyle} />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Mot de passe</label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: textMuted, display: "flex" }}>
                  <Lock size={16} />
                </span>
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder={isSetupMode ? "Minimum 8 caractères" : "Votre mot de passe"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  style={{ ...inputStyle, padding: "10px 36px 10px 36px" }}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: textMuted, padding: 0, display: "flex" }}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {isSetupMode && (
              <div>
                <label style={labelStyle}>Confirmer le mot de passe</label>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: textMuted, display: "flex" }}>
                    <Lock size={16} />
                  </span>
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Répétez le mot de passe"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    required
                    style={inputStyle}
                  />
                </div>
              </div>
            )}

            {error && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "10px 12px",
                background: "rgba(239,68,68,0.06)",
                border: "1px solid rgba(239,68,68,0.2)",
                borderRadius: 8, color: "#dc2626", fontSize: 13,
              }}>
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isPending}
              style={{
                width: "100%",
                padding: "11px 16px",
                background: isPending ? "#e2e6f0" : `linear-gradient(135deg, ${accent}, #7c3aed)`,
                border: "none",
                borderRadius: 8,
                color: isPending ? textMuted : "white",
                fontSize: 14,
                fontWeight: 600,
                cursor: isPending ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                boxShadow: isPending ? "none" : "0 4px 12px rgba(79,70,229,0.3)",
                transition: "opacity 0.15s",
              }}
            >
              {isPending
                ? <><Loader2 size={16} style={{ animation: "spin 0.8s linear infinite" }} />{isSetupMode ? "Création..." : "Connexion..."}</>
                : isSetupMode ? "Créer mon compte" : "Se connecter"}
            </button>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </form>

          <div style={{ marginTop: 24, paddingTop: 16, borderTop: `1px solid ${border}`, textAlign: "center" }}>
            <p style={{ color: "#94a3b8", fontSize: 12 }}>PIPL v1.3 — Authentification locale sécurisée</p>
          </div>
        </div>
      </div>
    </div>
  );
}
