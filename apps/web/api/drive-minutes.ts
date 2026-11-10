// POST /api/drive-minutes — admin-only Drive duration probe.
// Body: { fileId: "<drive id>" } + Authorization: Bearer <admin JWT>
// Success: { ok: true, minutes } — from videoMediaMetadata.durationMillis.
// Failure: { ok: false, code, ar, en }.
//
// WHY server-side: viewer-only Drive files expose no duration headers to
// browsers (direct metadata preload fails), but Google's Drive API answers
// metadata reads for anyone-with-link files. The GOOGLE_API_KEY stays here
// (Vercel env, never shipped to clients).
//
// SELF-CONTAINED ON PURPOSE: no relative imports of any kind (see api/play.ts).

import { createClient } from "@supabase/supabase-js";

type Code = "OK" | "BAD_REQUEST" | "FORBIDDEN" | "NO_METADATA" | "UPSTREAM" | "SERVER_ERROR" | "METHOD_NOT_ALLOWED" | "INVALID_TOKEN";

const ERR: Record<Exclude<Code, "OK">, { status: number; ar: string; en: string }> = {
  BAD_REQUEST: { status: 400, ar: "طلب غير صالح.", en: "Bad request." },
  FORBIDDEN: { status: 403, ar: "للأدمن فقط.", en: "Admins only." },
  NO_METADATA: { status: 404, ar: "لا توجد مدة مسجلة لهذا الملف.", en: "No duration metadata for this file." },
  UPSTREAM: { status: 502, ar: "جوجل درايف لم يرد — حاول مجددًا.", en: "Google Drive did not answer — retry." },
  SERVER_ERROR: { status: 500, ar: "خطأ في الخادم — حاول مجددًا.", en: "Server error — please retry." },
  METHOD_NOT_ALLOWED: { status: 405, ar: "طريقة غير مسموحة.", en: "Method not allowed." },
  INVALID_TOKEN: { status: 401, ar: "انتهت الجلسة — سجّل الدخول مرة أخرى.", en: "Session invalid — please sign in again." },
};

export type ApiRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
};

export type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => unknown;
};

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

function fail(res: ApiResponse, code: Exclude<Code, "OK">, detail?: string): unknown {
  const e = ERR[code];
  try {
    (globalThis as unknown as { console?: { error: (...a: unknown[]) => void } }).console?.error(
      `[api/drive-minutes] ${code}${detail ? ` (${detail})` : ""}`,
    );
  } catch {
    /* logging must never break the response */
  }
  return res.status(e.status).json({ ok: false, code, ar: e.ar, en: e.en });
}

function bearer(headers: ApiRequest["headers"]): string | null {
  const raw = headers.authorization ?? headers.Authorization;
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== "string") return null;
  const m = v.match(/^Bearer\s+(.+)$/i);
  const token = m ? m[1].trim() : "";
  return token !== "" ? token : null;
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<unknown> {
  if (req.method !== "POST") return fail(res, "METHOD_NOT_ALLOWED", "method");
  const googleKey = getEnvVar("GOOGLE_API_KEY");
  const url = getEnvVar("SUPABASE_URL");
  const anonKey = getEnvVar("SUPABASE_ANON_KEY");
  const serviceKey = getEnvVar("SUPABASE_SERVICE_ROLE_KEY");
  if (googleKey === "" || url === "" || anonKey === "" || serviceKey === "") {
    return fail(res, "SERVER_ERROR", "env-missing");
  }

  const token = bearer(req.headers);
  if (!token) return fail(res, "INVALID_TOKEN", "no-bearer");

  const rawBody = typeof req.body === "string" ? safeJson(req.body) : req.body;
  const body = (rawBody ?? {}) as { fileId?: unknown };
  const fileId = typeof body.fileId === "string" ? body.fileId.trim() : "";
  if (!/^[a-zA-Z0-9_-]+$/.test(fileId)) return fail(res, "BAD_REQUEST", "file-id");

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return fail(res, "INVALID_TOKEN", "get-user");

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: prof } = await admin
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .maybeSingle();
  if ((prof as { role?: string } | null)?.role !== "admin") {
    return fail(res, "FORBIDDEN", "role");
  }

  let meta: { videoMediaMetadata?: { durationMillis?: string } };
  try {
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=videoMediaMetadata(durationMillis),mimeType&key=${encodeURIComponent(googleKey)}`,
    );
    if (!r.ok) return fail(res, "UPSTREAM", `drive-${r.status}`);
    meta = (await r.json()) as typeof meta;
  } catch {
    return fail(res, "UPSTREAM", "drive-fetch");
  }
  const ms = Number(meta?.videoMediaMetadata?.durationMillis ?? NaN);
  if (!Number.isFinite(ms) || ms <= 0) return fail(res, "NO_METADATA");
  return res.status(200).json({ ok: true, minutes: Math.max(1, Math.ceil(ms / 60000)) });
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
