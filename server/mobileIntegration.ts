/**
 * mobileIntegration.ts
 * Intégration Expo EAS + Apple App Store Connect pour PIPL
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { getDb } from "./db";
import { settings } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// ─── Helpers DB ──────────────────────────────────────────────────────────────

async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1);
  return rows[0]?.value ?? null;
}

// ─── Expo EAS API ─────────────────────────────────────────────────────────────

const EXPO_GRAPHQL = "https://api.expo.dev/graphql";

async function expoQuery(query: string, token: string): Promise<any> {
  const resp = await fetch(EXPO_GRAPHQL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const data = await resp.json();
  if (data.errors) throw new Error(data.errors[0].message);
  return data.data;
}

export interface ExpoBuild {
  id: string;
  platform: "ANDROID" | "IOS";
  status: "FINISHED" | "ERRORED" | "IN_QUEUE" | "IN_PROGRESS" | "CANCELED";
  buildProfile: string;
  createdAt: string;
  completedAt: string | null;
  appVersion: string;
  buildUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  logFiles: string[];
}

export interface ExpoStatus {
  connected: boolean;
  username: string | null;
  email: string | null;
  appName: string | null;
  appSlug: string | null;
  builds: ExpoBuild[];
  totalBuilds: number;
  successBuilds: number;
  errorBuilds: number;
  lastBuildAt: string | null;
  error?: string;
}

export async function getExpoStatus(): Promise<ExpoStatus> {
  const token = await getSetting("expo_token");
  const appId = await getSetting("expo_app_id");

  if (!token || !appId) {
    return {
      connected: false,
      username: null,
      email: null,
      appName: null,
      appSlug: null,
      builds: [],
      totalBuilds: 0,
      successBuilds: 0,
      errorBuilds: 0,
      lastBuildAt: null,
      error: "Credentials Expo non configurés",
    };
  }

  try {
    // Infos utilisateur
    const meData = await expoQuery(
      `{ me { username email } }`,
      token
    );

    // Infos app + builds
    const appData = await expoQuery(
      `{ app { byId(appId: "${appId}") {
          id name slug
          builds(limit: 20, offset: 0) {
            id platform status buildProfile
            createdAt completedAt appVersion
            error { errorCode message }
            logFiles
            artifacts { buildUrl }
          }
        }
      } }`,
      token
    );

    const app = appData.app.byId;
    const rawBuilds = app.builds as any[];

    const builds: ExpoBuild[] = rawBuilds.map((b: any) => ({
      id: b.id,
      platform: b.platform,
      status: b.status,
      buildProfile: b.buildProfile,
      createdAt: b.createdAt,
      completedAt: b.completedAt,
      appVersion: b.appVersion,
      buildUrl: b.artifacts?.buildUrl ?? null,
      errorCode: b.error?.errorCode ?? null,
      errorMessage: b.error?.message ?? null,
      logFiles: b.logFiles ?? [],
    }));

    const successBuilds = builds.filter((b) => b.status === "FINISHED").length;
    const errorBuilds = builds.filter((b) => b.status === "ERRORED").length;
    const lastBuildAt = builds[0]?.createdAt ?? null;

    return {
      connected: true,
      username: meData.me.username,
      email: meData.me.email,
      appName: app.name,
      appSlug: app.slug,
      builds,
      totalBuilds: builds.length,
      successBuilds,
      errorBuilds,
      lastBuildAt,
    };
  } catch (err: any) {
    return {
      connected: false,
      username: null,
      email: null,
      appName: null,
      appSlug: null,
      builds: [],
      totalBuilds: 0,
      successBuilds: 0,
      errorBuilds: 0,
      lastBuildAt: null,
      error: err.message,
    };
  }
}

// ─── Apple App Store Connect API ──────────────────────────────────────────────

function generateAppleJWT(keyId: string, issuerId: string, privateKey: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({ iss: issuerId, iat: now, exp: now + 1200, aud: "appstoreconnect-v1" })
  ).toString("base64url");

  const signingInput = `${header}.${payload}`;
  const sign = crypto.createSign("SHA256");
  sign.update(signingInput);
  sign.end();
  const signature = sign.sign({ key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url");

  return `${signingInput}.${signature}`;
}

export interface AppleApp {
  id: string;
  name: string;
  bundleId: string;
  sku: string;
  primaryLocale: string;
  appStoreState: string | null;
}

export interface AppleStatus {
  connected: boolean;
  apps: AppleApp[];
  testflightBuilds: any[];
  error?: string;
}

export async function getAppleStatus(): Promise<AppleStatus> {
  const keyId = await getSetting("apple_key_id");
  const issuerId = await getSetting("apple_issuer_id");

  if (!keyId || !issuerId) {
    return {
      connected: false,
      apps: [],
      testflightBuilds: [],
      error: "Credentials Apple non configurés",
    };
  }

  // Chercher le fichier .p8 — d'abord via la DB, sinon chemin par défaut
  const storedPath = await getSetting("apple_p8_path");
  const p8Path = storedPath ?? path.join(process.cwd(), "server", `AuthKey_${keyId}.p8`);
  if (!fs.existsSync(p8Path)) {
    return {
      connected: false,
      apps: [],
      testflightBuilds: [],
      error: `Fichier AuthKey_${keyId}.p8 introuvable sur le serveur`,
    };
  }

  const privateKey = fs.readFileSync(p8Path, "utf8");

  try {
    const jwt = generateAppleJWT(keyId, issuerId, privateKey);

    // Lister les apps
    const appsResp = await fetch(
      "https://api.appstoreconnect.apple.com/v1/apps?limit=10&fields[apps]=name,bundleId,sku,primaryLocale",
      { headers: { Authorization: `Bearer ${jwt}` } }
    );
    const appsData = await appsResp.json();

    if (appsData.errors) {
      return {
        connected: false,
        apps: [],
        testflightBuilds: [],
        error: appsData.errors[0]?.detail ?? "Erreur API Apple",
      };
    }

    const apps: AppleApp[] = (appsData.data ?? []).map((a: any) => ({
      id: a.id,
      name: a.attributes.name,
      bundleId: a.attributes.bundleId,
      sku: a.attributes.sku ?? "",
      primaryLocale: a.attributes.primaryLocale ?? "fr-FR",
      appStoreState: null,
    }));

    // Si des apps existent, récupérer les builds TestFlight
    let testflightBuilds: any[] = [];
    if (apps.length > 0) {
      const buildsResp = await fetch(
        `https://api.appstoreconnect.apple.com/v1/builds?limit=10&filter[app]=${apps[0].id}&fields[builds]=version,uploadedDate,processingState,minOsVersion`,
        { headers: { Authorization: `Bearer ${jwt}` } }
      );
      const buildsData = await buildsResp.json();
      testflightBuilds = (buildsData.data ?? []).map((b: any) => ({
        id: b.id,
        version: b.attributes.version,
        uploadedDate: b.attributes.uploadedDate,
        processingState: b.attributes.processingState,
        minOsVersion: b.attributes.minOsVersion,
      }));
    }

    return {
      connected: true,
      apps,
      testflightBuilds,
    };
  } catch (err: any) {
    return {
      connected: false,
      apps: [],
      testflightBuilds: [],
      error: err.message,
    };
  }
}
