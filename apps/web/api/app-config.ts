// GET /api/app-config — public runtime config for the WEB layer.
//
// Purpose: the native shell loads the web app from Vercel, so the blocking
// "update required" screen MUST live in the web layer (an old shell still
// renders the new web app and can show it).
//
// Fail-open BY DESIGN: if the DB row is missing, unreadable or the env vars
// are absent, the endpoint answers with the SAFE defaults below
// (min_supported_version "0.0.0", force_update false) so no student is ever
// locked out by a configuration or infrastructure failure.
//
// SELF-CONTAINED ON PURPOSE: no relative imports of any kind (see api/play.ts).

import { createClient } from "@supabase/supabase-js";

type ApiRequest = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => unknown;
  setHeader?: (name: string, value: string) => void;
};

export type NativeGate = {
  /** Master switch: false disables the whole gate (never blocks anyone). */
  gate_enabled: boolean;
  /** Lowest supported native app version (semver, e.g. "1.2.0"). */
  min_supported_version: string;
  /** When true, an outdated app is blocked; when false, only warned about. */
  force_update: boolean;
  message_ar: string;
  message_en: string;
};

const KEY = "native_gate";

/** Safe defaults — identical to the seeded migration row. */
const DEFAULT_GATE: NativeGate = {
  gate_enabled: true,
  min_supported_version: "0.0.0",
  force_update: false,
  message_ar: "",
  message_en: "",
};

const TTL_MS = 20_000;
let cache: { at: number; gate: NativeGate } | null = null;

function getEnvVar(name: string): string {
  try {
    const g = globalThis as unknown as {
      process?: { env?: Record<string, string | undefined> };
    };
    const v = g.process?.env?.[name];
    return typeof v === "string" ? v : "";
  } catch {
    return "";
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function normalize(value: unknown): NativeGate {
  if (!isRecord(value)) return DEFAULT_GATE;
  return {
    gate_enabled: typeof value.gate_enabled === "boolean" ? value.gate_enabled : DEFAULT_GATE.gate_enabled,
    min_supported_version:
      typeof value.min_supported_version === "string"
        ? value.min_supported_version.trim()
        : DEFAULT_GATE.min_supported_version,
    force_update: typeof value.force_update === "boolean" ? value.force_update : DEFAULT_GATE.force_update,
    message_ar: typeof value.message_ar === "string" ? value.message_ar : DEFAULT_GATE.message_ar,
    message_en: typeof value.message_en === "string" ? value.message_en : DEFAULT_GATE.message_en,
  };
}

async function readGate(): Promise<NativeGate> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.gate;

  const url = getEnvVar("SUPABASE_URL");
  const serviceKey = getEnvVar("SUPABASE_SERVICE_ROLE_KEY");
  if (url === "" || serviceKey === "") {
    // No DB => fail open (never blocks a student because of a deploy).
    return DEFAULT_GATE;
  }
  try {
    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", KEY)
      .maybeSingle();
    if (error || !data) return DEFAULT_GATE;
    const gate = normalize((data as { value?: unknown }).value);
    cache = { at: now, gate };
    return gate;
  } catch {
    return DEFAULT_GATE;
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<unknown> {
  res.setHeader?.("Cache-Control", "no-store");
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED" });
  }
  const gate = await readGate();
  return res.status(200).json({ ok: true, native_gate: gate });
}
