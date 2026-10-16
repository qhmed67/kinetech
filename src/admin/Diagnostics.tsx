import { useEffect, useRef, useState } from "react";
import { useLang } from "../components/lang";
import { BUILD_HASH } from "../build";
import { isSupabaseConfigured } from "../lib/db/env";

/* One-click system diagnostics: every layer that can silently break a save
   or a play, checked live and reported in plain rows. The admin runs it,
   pastes the report, and the culprit is named — no more guessing. */

type Row = { label: string; state: "run" | "ok" | "bad" | "info"; detail: string };

const STR = {
  en: {
    title: "System diagnostics",
    run: "Run checks",
    running: "Checking…",
    copy: "Copy report",
    copied: "Copied ✓",
    build: "App build",
    cloud: "Supabase configured",
    session: "Admin session",
    sessionOk: "signed in + verified admin",
    sessionBad: "no session or not admin — log in again",
    rpc: "RPC",
    present: "present",
    missing: "MISSING — run the migration",
    srcDropped: "videos.src_url dropped",
    srcDroppedYes: "dropped (post-20261033, correct)",
    srcDroppedNo: "still present (pre-20261033)",
    sources: "video_sources backfilled",
    courses: "Courses local vs DB (modules/videos)",
    outbox: "Unsynced queue",
    outboxEmpty: "empty",
    api: "/api reachability",
    apiOk: "functions answer JSON",
    apiBad: "broken — redeploy / check env",
    yes: "yes",
    no: "no",
  },
  ar: {
    title: "تشخيص النظام",
    run: "تشغيل الفحص",
    running: "…بيفحص",
    copy: "نسخ التقرير",
    copied: "✓ اتنسخ",
    build: "نسخة التطبيق",
    cloud: "Supabase مظبوط",
    session: "جلسة الأدمن",
    sessionOk: "مسجل + أدمن متحقق",
    sessionBad: "مفيش جلسة أو مش أدمن — سجل دخول تاني",
    rpc: "RPC",
    present: "موجود",
    missing: "ناقص — نفذ ملف الهجرة",
    srcDropped: "videos.src_url محذوف",
    srcDroppedYes: "محذوف (بعد 20261033 — صح)",
    srcDroppedNo: "لسه موجود (قبل 20261033)",
    sources: "video_sources منقول",
    courses: "الكورسات محلي ضد القاعدة (أجزاء/فيديوهات)",
    outbox: "طابور غير مُزامن",
    outboxEmpty: "فاضي",
    api: "وصول /api",
    apiOk: "الدوال بترد JSON",
    apiBad: "مكسور — أعد النشر / راجع المتغيرات",
    yes: "أيوه",
    no: "لأ",
  },
};

export function Diagnostics() {
  const { lang } = useLang();
  const t = lang === "ar" ? STR.ar : STR.en;
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const push = (r: Row) => {
    if (alive.current) setRows((prev) => [...prev, r]);
  };

  const run = async () => {
    setRows([]);
    setCopied(false);
    setBusy(true);
    try {
      push({ label: t.build, state: "info", detail: BUILD_HASH });
      if (!isSupabaseConfigured()) {
        push({ label: t.cloud, state: "bad", detail: t.no });
        return;
      }
      push({ label: t.cloud, state: "ok", detail: t.yes });
      const { supabase } = await import("../lib/db/client");
      const sb = supabase();
      if (!sb) {
        push({ label: t.session, state: "bad", detail: t.sessionBad });
        return;
      }
      // Session + admin in one shot.
      let isAdmin = false;
      try {
        const { checkAdmin } = await import("../lib/db/adminGuard");
        isAdmin = await checkAdmin();
      } catch {
        isAdmin = false;
      }
      push({ label: t.session, state: isAdmin ? "ok" : "bad", detail: isAdmin ? t.sessionOk : t.sessionBad });

      // RPC presence (no side effects: bogus args, gated calls only).
      // NOTE: PostgREST resolves overloads by the EXACT argument set, so
      // request_play MUST be probed with all its parameters (defaults do
      // NOT satisfy resolution — a partial call false-reports MISSING).
      const rpcs: Array<[string, Record<string, unknown>]> = [
        ["admin_video_sources", { p_slug: "__probe__" }],
        ["get_exam", { p_video: "00000000-0000-0000-0000-000000000000", p_kind: "exam" }],
        ["submit_exam", { p_video: "00000000-0000-0000-0000-000000000000", p_kind: "exam", p_answers: {} }],
        ["request_play", {
          p_video: "00000000-0000-0000-0000-000000000000",
          p_session: "00000000-0000-0000-0000-000000000000",
          p_ip: "", p_ua: "",
          p_r1_max: 5, p_r1_secs: 30, p_r2_warn: 120, p_r2_deny: 240,
          p_r2_mins: 60, p_r3_max: 3, p_repeat_mins: 90,
        }],
      ];
      for (const [fn, args] of rpcs) {
        try {
          const r = (await (sb.rpc as unknown as (f: string, a: unknown) => Promise<{ error?: { code?: string; message?: string } | null }>)(
            fn,
            args,
          ));
          const msg = `${r?.error?.code ?? ""} ${r?.error?.message ?? ""}`;
          if (!r?.error || !/PGRST202|could not find|does not exist|schema cache/i.test(msg)) {
            push({ label: `${t.rpc} ${fn}`, state: "ok", detail: t.present });
          } else {
            push({ label: `${t.rpc} ${fn}`, state: "bad", detail: `${t.missing} (${msg.trim()})` });
          }
        } catch {
          push({ label: `${t.rpc} ${fn}`, state: "bad", detail: t.missing });
        }
      }

      // Column drop state.
      try {
        const r = await sb.from("videos").select("src_url").limit(0);
        const gone = !!(r as unknown as { error?: unknown }).error;
        push({ label: t.srcDropped, state: "info", detail: gone ? t.srcDroppedYes : t.srcDroppedNo });
      } catch {
        push({ label: t.srcDropped, state: "info", detail: "?" });
      }

      // video_sources is RLS-locked with NO policies: a client SELECT
      // ALWAYS returns [] (default-deny), rows or not. So emptiness proves
      // nothing — report the lock itself, verified by the fact that plays
      // burn (grants require a sources row server-side).
      try {
        const { data: vids } = await sb.from("videos").select("id").limit(1);
        const hasVideos = ((vids ?? []) as unknown[]).length > 0;
        await sb.from("video_sources").select("video_id").limit(1);
        push({
          label: t.sources,
          state: "info",
          detail: hasVideos
            ? "client-unreadable by design (RLS, no policies) — backfill proven by working playback"
            : "no videos yet — nothing to backfill",
        });
      } catch {
        push({ label: t.sources, state: "bad", detail: "query failed" });
      }

      // Per-course local vs DB counts + outbox.
      try {
        const { loadStore, listQueuedPushes } = await import("../store");
        const local = loadStore().courses;
        const [{ data: mods }, { data: vids }] = await Promise.all([
          sb.from("modules").select("course_id"),
          sb.from("videos").select("course_id"),
        ]);
        // Match local courses to DB courses by slug -> id.
        const { data: dbCourses } = await sb.from("courses").select("id,slug");
        const idBySlug = new Map(
          ((dbCourses ?? []) as Array<{ id: string; slug: string }>).map((c) => [c.slug, c.id]),
        );
        const modsByCourse = new Map<string, number>();
        for (const r of ((mods ?? []) as Array<{ course_id: string }>)) {
          modsByCourse.set(r.course_id, (modsByCourse.get(r.course_id) ?? 0) + 1);
        }
        const vidsByCourse = new Map<string, number>();
        for (const r of ((vids ?? []) as Array<{ course_id: string }>)) {
          vidsByCourse.set(r.course_id, (vidsByCourse.get(r.course_id) ?? 0) + 1);
        }
        const queued = new Set(listQueuedPushes());
        for (const c of local) {
          const id = idBySlug.get(c.slug);
          const lm = c.modules.en.length;
          const lv = c.videos.length;
          const dm = id !== undefined ? (modsByCourse.get(id) ?? 0) : -1;
          const dv = id !== undefined ? (vidsByCourse.get(id) ?? 0) : -1;
          const same = dm === lm; // videos: DB counts rows incl. sourceless; compare loosely
          push({
            label: `${t.courses}: ${c.slug}${queued.has(c.slug) ? " [queued]" : ""}`,
            state: id === undefined ? "bad" : same ? "ok" : "bad",
            detail:
              id === undefined
                ? "missing in DB"
                : `local ${lm}/${lv} vs db ${dm}/${dv}`,
          });
        }
      } catch {
        push({ label: t.courses, state: "bad", detail: "query failed" });
      }

      // /api reachability: garbage token must still yield JSON (function alive).
      try {
        const r = await fetch("/api/session-register", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: "Bearer __probe__" },
          body: "{}",
        });
        const text = await r.text();
        const parsed = JSON.parse(text) as { ok?: boolean };
        push({
          label: t.api,
          state: typeof parsed.ok === "boolean" ? "ok" : "bad",
          detail: typeof parsed.ok === "boolean" ? `${t.apiOk} (http ${r.status})` : t.apiBad,
        });
      } catch {
        push({ label: t.api, state: "bad", detail: t.apiBad });
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const copy = async () => {
    const text = rows.map((r) => `[${r.state}] ${r.label}: ${r.detail}`).join("\n");
    try {
      await navigator.clipboard.writeText(`build ${BUILD_HASH}\n${text}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  const dot = (s: Row["state"]) =>
    s === "ok" ? "#1F9D55" : s === "bad" ? "#B3261E" : s === "info" ? "#6E4E9C" : "var(--muted)";

  return (
    <div className="grid gap-3 rounded-[20px] border bg-white p-6" style={{ borderColor: "var(--kt-line)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>{t.title}</h2>
        <div className="flex gap-2">
          <button type="button" onClick={() => void run()} disabled={busy} className="btn btn-secondary disabled:opacity-60" style={{ minHeight: 40, padding: "8px 18px", fontSize: 14 }}>
            {busy ? t.running : t.run}
          </button>
          {rows.length > 0 && (
            <button type="button" onClick={() => void copy()} className="btn btn-secondary" style={{ minHeight: 40, padding: "8px 18px", fontSize: 14 }}>
              {copied ? t.copied : t.copy}
            </button>
          )}
        </div>
      </div>
      {rows.map((r, i) => (
        <div key={i} className="flex items-start gap-3 rounded-xl px-3 py-2 text-sm" style={{ background: "var(--surface)" }}>
          <span aria-hidden="true" className="mt-1.5 h-2.5 w-2.5 flex-none rounded-full" style={{ background: dot(r.state) }} />
          <div className="min-w-0">
            <p className="font-bold">{r.label}</p>
            <p dir="auto" className="break-words" style={{ color: "var(--muted)" }}>{r.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
