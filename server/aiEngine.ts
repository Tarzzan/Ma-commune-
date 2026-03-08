/**
 * aiEngine.ts — Gestionnaire multi-moteur IA pour PIPL
 * Supporte : OpenAI (clé personnelle) et Manus Forge (proxy sandbox)
 */

import { getDb } from "./db";
import { settings } from "../drizzle/schema";
import { eq } from "drizzle-orm";

export type AiEngine = "openai" | "manus_forge";

export interface AiEngineConfig {
  engine: AiEngine;
  openaiApiKey?: string;
  openaiModel?: string;
  manusForgeUrl?: string;
  manusForgeApiKey?: string;
}

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string; detail?: string } }
      >;
}

export interface LLMParams {
  messages: LLMMessage[];
  response_format?: {
    type: "json_schema" | "json_object" | "text";
    json_schema?: {
      name: string;
      strict?: boolean;
      schema: Record<string, unknown>;
    };
  };
  max_tokens?: number;
}

/**
 * Récupère la configuration du moteur IA depuis la base de données
 */
export async function getAiEngineConfig(): Promise<AiEngineConfig> {
  const db = await getDb();
  if (!db) return { engine: "manus_forge" as AiEngine };
  const rows = await db.select().from(settings);
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value ?? "";
  }
  return {
    engine: (map["ai_engine"] as AiEngine) || "manus_forge",
    openaiApiKey: map["openai_api_key"] || "",
    openaiModel: map["openai_model"] || "gpt-4o",
    manusForgeUrl: map["manus_forge_url"] || "https://forge.manus.im",
    manusForgeApiKey: map["manus_forge_api_key"] || "",
  };
}

/**
 * Met à jour un paramètre dans la table settings
 */
export async function updateSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db
    .select()
    .from(settings)
    .where(eq(settings.key, key));
  if (existing.length > 0) {
    await db
      .update(settings)
      .set({ value })
      .where(eq(settings.key, key));
  } else {
    await db.insert(settings).values({ key, value });
  }
}

/**
 * Appelle le LLM via le moteur configuré (OpenAI ou Manus Forge)
 */
export async function invokeLLMWithEngine(
  params: LLMParams,
  config?: AiEngineConfig
): Promise<{ choices: Array<{ message: { content: string } }> }> {
  const cfg = config ?? (await getAiEngineConfig());

  if (cfg.engine === "openai") {
    return invokeOpenAI(params, cfg);
  } else {
    return invokeManusForge(params, cfg);
  }
}

/**
 * Appel direct à l'API OpenAI
 */
async function invokeOpenAI(
  params: LLMParams,
  cfg: AiEngineConfig
): Promise<{ choices: Array<{ message: { content: string } }> }> {
  if (!cfg.openaiApiKey) {
    throw new Error("Clé API OpenAI non configurée. Veuillez la renseigner dans Configuration → Moteur IA.");
  }

  const body: Record<string, unknown> = {
    model: cfg.openaiModel || "gpt-4o",
    messages: params.messages,
    max_tokens: params.max_tokens || 4096,
  };
  if (params.response_format) {
    body.response_format = params.response_format;
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.openaiApiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${err}`);
  }

  return res.json();
}

/**
 * Appel via Manus Forge (utilise la clé BUILT_IN_FORGE_API_KEY de l'env)
 */
async function invokeManusForge(
  params: LLMParams,
  cfg: AiEngineConfig
): Promise<{ choices: Array<{ message: { content: string } }> }> {
  const forgeApiKey =
    cfg.manusForgeApiKey ||
    process.env.BUILT_IN_FORGE_API_KEY ||
    "";

  if (!forgeApiKey) {
    throw new Error(
      "Manus Forge non disponible sur ce serveur. Veuillez configurer une clé OpenAI dans Configuration → Moteur IA."
    );
  }

  const forgeUrl = cfg.manusForgeUrl || "https://forge.manus.im";
  const endpoint = `${forgeUrl.replace(/\/$/, "")}/v1/chat/completions`;

  const body: Record<string, unknown> = {
    model: "claude-3-7-sonnet",
    messages: params.messages,
    max_tokens: params.max_tokens || 4096,
  };
  if (params.response_format) {
    body.response_format = params.response_format;
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${forgeApiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Manus Forge API error ${res.status}: ${err}`);
  }

  return res.json();
}
