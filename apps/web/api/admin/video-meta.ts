// POST /api/admin/video-meta — admin-only Drive file validation hint.
// Body: { fileId: "<drive id>" } + Authorization: Bearer <admin JWT>
// Success: { ok: true, fileId, mimeType, size, isMp4, faststart,
//            moovOffset, mdatBeforeMoov, warning }
// Failure: { ok: false, code, ar, en }
//
// WHY server-side: the GOOGLE_API_KEY stays in Vercel env, and the faststart
// check needs the first 256 KB of the file (a Range read) — never shipped to
// the browser. A warning here is a HINT for the admin, never a blocker: the
// player still falls back to Drive/YouTube when a file is not ideal.
//
// SELF-CONTAINED ON PURPOSE: no relative imports of any kind (see api/play.ts).

import { AsyncLocalStorage } from "node:async_hooks";
import { createClient } from "@supabase/supabase-js";

/** The moov atom must start inside the first 256 KB to count as faststart. */
const FASTSTART_WINDOW = 256 * 1024;

type Code =
  | "OK"
  | "BAD_REQUEST"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "UPSTREAM"
  | "SERVER_ERROR"
  | "METHOD_NOT_ALLOWED"
  | "INVALID_TOKEN";

const ERR: Record<Exclude<Code, "OK">, { status: number; ar: string; en: string }> = {
  BAD_REQUEST: { status: 400, ar: "طلب غير صالح.", en: "Bad request." },
  FORBIDDEN: { status: 403, ar: "للأدمن فقط.", en: "Admins only." },
  NOT_FOUND: { status: 404, ar: "الملف غير موجود أو المشاركة مقفولة.", en: "File not found or not shared." },
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
  setHeader?: (name: string, value: string) => void;
};

// --- request logging boundary (mirrored: api files must stay self-contained) ---
const ROUTE = "/api/admin/video-meta";
const REQ = new AsyncLocalStorage<string>();
type Level = "info" | "warn" | "error";
type LogError = { code: string; type: string; message: string };
const MIN_LEVEL: Record<Level, number> = { info: 20, warn: 30, error: 40 };

function logEnv(name: string): string {
  try {
    const g = globalThis as unknown as { process?: { env?: Record<string, string | undefined> } };
    const value = g.process?.env?.[name];
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}

function emit(level: Level, event: string, msg: string, ctx: Record<string, unknown> = {}, error?: LogError): void {
  try {
    const min = logEnv("LOG_LEVEL") as Level;
    if (min in MIN_LEVEL && MIN_LEVEL[level] < MIN_LEVEL[min]) return;
    const id = REQ.getStore();
    const rec: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level,
      service: "kinetech-api",
      env: logEnv("VERCEL_ENV") || "dev",
      version: logEnv("VERCEL_GIT_COMMIT_SHA") || "dev",
      module: "api.admin.video-meta",
      event,
      msg,
      ...(id ? { correlation_id: id } : {}),
      ctx,
    };
    if (error) rec.error = { ...error, cause: null, stack: null };
    process.stdout.write(`${JSON.stringify(rec)}\n`); // allow-print
  } catch {
    /* logging must never break a response */
  }
}

const WARN_CODE: Record<Exclude<Code, "OK">, string> = {
  BAD_REQUEST: "VAL_001",
  FORBIDDEN: "AUTH_002",
  NOT_FOUND: "SYS_002",
  UPSTREAM: "EXT_001",
  SERVER_ERROR: "SYS_002",
  METHOD_NOT_ALLOWED: "VAL_001",
  INVALID_TOKEN: "AUTH_001",
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
  emit("warn", "api.request.rejected", e.en, { route: ROUTE, code, detail: detail ?? null }, {
    code: WARN_CODE[code],
    type: "ApiError",
    message: e.en,
  });
  return res.status(e.status).json({ ok: false, code, ar: e.ar, en: e.en, correlation_id: REQ.getStore() ?? null });
}

function bearer(headers: ApiRequest["headers"]): string | null {
  const raw = headers.authorization ?? headers.Authorization;
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== "string") return null;
  const m = v.match(/^Bearer\s+(.+)$/i);
  const token = m ? m[1].trim() : "";
  return token !== "" ? token : null;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

type AtomScan = { faststart: boolean; moovOffset: number | null; mdatBeforeMoov: boolean };

/** Walk ISO-BMFF boxes in the first 256 KB. Faststart = moov before mdat. */
export function scanFaststart(buffer: ArrayBuffer): AtomScan {
  const view = new DataView(buffer);
  const len = buffer.byteLength;
  let offset = 0;
  let mdatBeforeMoov = false;
  while (offset + 8 <= len) {
    let size = view.getUint32(offset, false);
    const type = String.fromCharCode(
      view.getUint8(offset + 4),
      view.getUint8(offset + 5),
      view.getUint8(offset + 6),
      view.getUint8(offset + 7),
    );
    let header = 8;
    if (size === 1 && offset + 16 <= len) {
      // 64-bit size.
      const hi = view.getUint32(offset + 8, false);
      const lo = view.getUint32(offset + 12, false);
      size = hi * 2 ** 32 + lo;
      header = 16;
    } else if (size === 0) {
      // Box extends to EOF.
      size = len - offset;
    }
    if (type === "moov") {
      return { faststart: !mdatBeforeMoov, moovOffset: offset, mdatBeforeMoov };
    }
    if (type === "mdat") mdatBeforeMoov = true;
    if (size < header) break;
    offset += size;
  }
  return { faststart: false, moovOffset: null, mdatBeforeMoov };
}

function requestId(headers: ApiRequest["headers"]): string {
  const pick = (name: string): string | string[] | undefined => {
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === name) return value;
    }
    return undefined;
  };
  const raw = pick("x-request-id") ?? pick("x-correlation-id");
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(value)
    ? value
    : `req_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

async function withLogging(req: ApiRequest, res: ApiResponse, fn: (s: ApiResponse) => Promise<unknown>): Promise<unknown> {
  const id = requestId(req.headers);
  const started = Date.now();
  let status = 200;
  let ended = false;
  res.setHeader?.("x-request-id", id);
  const tracked: ApiResponse = {
    status(code) {
      status = code;
      res.status(code);
      return tracked;
    },
    json(body) {
      if (!ended) {
        ended = true;
        emit("info", "api.request.end", "request finished", {
          route: ROUTE,
          method: req.method ?? "GET",
          status,
          duration_ms: Date.now() - started,
        });
      }
      return res.json(body);
    },
  };
  return REQ.run(id, async () => {
    try {
      return await fn(tracked);
    } catch (error) {
      if (!ended) {
        ended = true;
        emit("error", "api.request.error", "unhandled error", { route: ROUTE, duration_ms: Date.now() - started }, {
          code: "SYS_001",
          type: error instanceof Error ? error.name : "Error",
          message: error instanceof Error ? error.message.slice(0, 500) : "unhandled error",
        });
        return res.status(500).json({
          ok: false,
          code: "SYS_001",
          ar: "خطأ في الخادم — حاول مجددًا.",
          en: "Server error — please retry.",
          correlation_id: id,
        });
      }
      return undefined;
    }
  });
}

async function handle(req: ApiRequest, res: ApiResponse): Promise<unknown> {
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
  if (!/^[a-zA-Z0-9_-]{10,}$/.test(fileId)) return fail(res, "BAD_REQUEST", "file-id");

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

  let meta: { mimeType?: string; size?: string; name?: string };
  try {
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size&supportsAllDrives=true&key=${encodeURIComponent(googleKey)}`,
    );
    if (r.status === 404) return fail(res, "NOT_FOUND", "drive-404");
    if (!r.ok) return fail(res, "UPSTREAM", `drive-${r.status}`);
    meta = (await r.json()) as typeof meta;
  } catch {
    return fail(res, "UPSTREAM", "drive-fetch");
  }

  const mimeType = typeof meta.mimeType === "string" ? meta.mimeType : "";
  const size = Number(meta.size ?? NaN);
  const isMp4 = mimeType === "video/mp4";

  // Faststart probe: first 256 KB only. A viewer-only file answers this with
  // the API key; a private file fails and the hint stays "unknown".
  let scan: AtomScan | null = null;
  try {
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true&key=${encodeURIComponent(googleKey)}`,
      { headers: { Range: `bytes=0-${FASTSTART_WINDOW - 1}` } },
    );
    // ONLY a bounded 206 is safe to read. A 200 means Drive ignored Range and
    // the body could be the whole lesson — never buffer that in a function.
    if (r.status === 206) {
      const length = Number(r.headers.get("content-length") ?? "0");
      if (length > 0 && length <= FASTSTART_WINDOW) {
        scan = scanFaststart(await r.arrayBuffer());
      }
    } else {
      try {
        await r.body?.cancel();
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* hint only — never a blocker */
  }

  const warning = !isMp4
    ? "not-mp4"
    : scan === null
      ? "faststart-unknown"
      : scan.faststart
        ? ""
        : "not-faststart";

  return res.status(200).json({
    ok: true,
    fileId,
    name: typeof meta.name === "string" ? meta.name : "",
    mimeType,
    size: Number.isFinite(size) ? size : null,
    isMp4,
    faststart: scan ? scan.faststart : null,
    moovOffset: scan ? scan.moovOffset : null,
    mdatBeforeMoov: scan ? scan.mdatBeforeMoov : null,
    warning,
  });
}

export default function handler(req: ApiRequest, res: ApiResponse): Promise<unknown> {
  return withLogging(req, res, (s) => handle(req, s));
}
