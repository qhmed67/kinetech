import { useEffect, useRef, useState } from "react";
import { loadStore, useContent, type StoreCourse } from "../store";
import { useLang } from "../components/lang";
import {
  deleteProfile,
  getUserVideoViews,
  grantEnrollment,
  listOrphans,
  resetUserVideo,
  revokeEnrollment,
  searchUser,
  sendNotification,
  setBanned,
  type FoundUser,
  type Orphan,
  type SearchKind,
} from "../lib/db/adminUsers";
import { groupCoursesAlpha } from "../lib/alpha";

/**
 * Custom course picker: native <select> cannot style group headers, so this
 * renders its own listbox — gray low-opacity letter, thin gray divider line
 * under each letter, plain rows for the courses themselves.
 */
function AlphaCoursePicker({
  courses,
  lang,
  value,
  placeholder,
  onPick,
}: {
  courses: StoreCourse[];
  lang: "en" | "ar";
  value: string;
  placeholder: string;
  onPick: (slug: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open ]);

  const groups = groupCoursesAlpha(
    courses,
    (c) => c.name[lang] ?? c.name.en,
    lang,
  );
  const selected = courses.find((c) => c.slug === value);

  return (
    <div ref={boxRef} className="relative min-w-0 flex-1 sm:flex-none">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-full border bg-white px-4 text-sm sm:w-64"
        style={{ borderColor: "var(--kt-line)" }}
      >
        <span className="truncate" style={{ color: selected ? undefined : "var(--muted)" }}>
          {selected ? (selected.name[lang] ?? selected.name.en) : placeholder}
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="h-4 w-4 flex-none" style={{ color: "var(--muted)" }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={placeholder}
          className="absolute z-30 mt-2 max-h-72 w-full min-w-56 overflow-y-auto rounded-2xl border bg-white p-2 shadow-xl"
          style={{ borderColor: "var(--kt-line)" }}
        >
          {groups.length === 0 && (
            <p className="px-3 py-2 text-sm" style={{ color: "var(--muted)" }}>{placeholder}</p>
          )}
          {groups.map((g) => (
            <div key={g.letter}>
              <div aria-hidden="true" className="px-3 pb-1 pt-2">
                <span
                  className="block text-xs font-bold uppercase"
                  style={{ color: "var(--kt-gray)", opacity: 0.65, fontFamily: "var(--font-display)" }}
                >
                  {g.letter}
                </span>
                <span aria-hidden="true" className="mt-1 block h-px w-full" style={{ background: "var(--kt-line)", opacity: 0.7 }} />
              </div>
              {g.items.map((c) => {
                const label = c.name[lang] ?? c.name.en;
                const active = c.slug === value;
                return (
                  <button
                    key={c.slug}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      onPick(c.slug);
                      setOpen(false);
                    }}
                    className="block w-full rounded-xl px-3 py-2 text-start text-sm transition-colors hover:bg-neutral-100"
                    style={active ? { background: "var(--surface)", fontWeight: 700 } : undefined}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One enrolled course: expandable per-part viewing sheet. Each part shows
 * its own used/3 count with its own restart — no course-wide aggregates.
 */
function CoursePartsRow({
  slug,
  courseName,
  userId,
  lang,
  revokeLabel,
  resetLabel,
  confirmReset,
  onRevoke,
}: {
  slug: string;
  courseName: string;
  userId: string;
  lang: "en" | "ar";
  revokeLabel: string;
  resetLabel: string;
  confirmReset: string;
  onRevoke: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [parts, setParts] = useState<{ sort_order: number; views: number; done: boolean }[] | null>(null);
  const [busyPart, setBusyPart] = useState<number | null>(null);
  const [okPart, setOkPart] = useState<number | null>(null);
  const [testState, setTestState] = useState<"idle" | "busy" | "ok">("idle");
  const [err, setErr] = useState("");

  const load = async () => {
    try {
      const { getRawCourse } = await import("../store");
      const raw = getRawCourse(slug);
      const rows = await getUserVideoViews(userId, slug);
      // Titles come from the local catalog (same order as sort_order).
      void raw;
      setParts(rows);
      setErr("");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "error");
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && parts === null) void load();
  };

  return (
    <li className="rounded-xl p-3 text-sm" style={{ background: "var(--surface)" }}>
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={toggle} aria-expanded={open} className="min-w-0 flex-1 text-start font-bold">
          <span aria-hidden="true" className="me-1">{open ? "▾" : "▸"}</span>
          {courseName}
        </button>
        <button
          type="button"
          onClick={onRevoke}
          className="flex-none text-sm font-bold"
          style={{ color: "#B3261E" }}
        >
          {revokeLabel}
        </button>
      </div>
      {open && (
        <div className="mt-2 grid gap-1.5 border-t pt-2" style={{ borderColor: "var(--kt-line)" }}>
          {parts === null && !err && (
            <p className="text-sm" style={{ color: "var(--muted)" }}>…</p>
          )}
          {err !== "" && (
            <p role="alert" className="text-sm font-bold" style={{ color: "#B3261E" }}>{err}</p>
          )}
          {parts !== null && parts.length === 0 && (
            <p className="text-sm" style={{ color: "var(--muted)" }}>—</p>
          )}
          {parts?.map((p) => (
            <div key={p.sort_order} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2">
              <span className="min-w-0 flex-1 truncate font-bold">
                <PartTitle slug={slug} idx={p.sort_order} lang={lang} />
                <span dir="ltr" className="ms-2 font-medium tabular-nums" style={{ color: "var(--muted)" }}>
                  {p.views}/3{p.done ? " ✓" : ""}
                </span>
              </span>
              <button
                type="button"
                disabled={busyPart !== null}
                onClick={() => {
                  if (!window.confirm(confirmReset)) return;
                  setBusyPart(p.sort_order);
                  resetUserVideo(userId, slug, p.sort_order)
                    .then(() => {
                      setOkPart(p.sort_order);
                      window.setTimeout(() => setOkPart(null), 2500);
                      return load();
                    })
                    .catch((ex: unknown) => setErr(ex instanceof Error ? ex.message : "error"))
                    .finally(() => setBusyPart(null));
                }}
                className="flex-none text-sm font-bold disabled:opacity-50"
                style={{ color: "var(--accent)" }}
              >
                {okPart === p.sort_order ? "✓" : resetLabel}
              </button>
            </div>
          ))}
          {/* Pipeline test: one lesson notice straight to this student's
              widget. "✓ sent" + visible-after-refresh proves the pipeline;
              an error names the broken half. */}
          <button
            type="button"
            disabled={testState === "busy"}
            onClick={() => {
              setTestState("busy");
              setErr("");
              void import("../lib/db/adminUsers")
                .then((m) => m.sendLessonNotice(userId, slug))
                .then(() => {
                  setTestState("ok");
                  window.setTimeout(() => setTestState("idle"), 4000);
                })
                .catch((ex: unknown) => {
                  setErr(ex instanceof Error ? ex.message : "error");
                  setTestState("idle");
                });
            }}
            className="mt-1 self-start rounded-lg bg-white px-3 py-2 text-sm font-bold disabled:opacity-50"
            style={{ color: "var(--kt-teal)" }}
          >
            {testState === "ok"
              ? (lang === "ar" ? "✓ اتبعت — حدّث ودجت الطالب" : "✓ sent — refresh student widget")
              : testState === "busy"
                ? "…"
                : (lang === "ar" ? "اختبار تنبيه الدرس" : "Test lesson notice")}
          </button>
        </div>
      )}
    </li>
  );
}

/** General notification composer: title + message straight to one user. */
function NotifyBox({
  userId,
  titleLabel,
  msgLabel,
  sendLabel,
  sentLabel,
  onError,
}: {
  userId: string;
  titleLabel: string;
  msgLabel: string;
  sendLabel: string;
  sentLabel: string;
  onError: (msg: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  return (
    <div className="grid gap-2 border-t pt-4" style={{ borderColor: "var(--kt-line)" }}>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={titleLabel}
        className="min-h-[44px] rounded-full border bg-white px-5 text-sm"
        style={{ borderColor: "var(--kt-line)" }}
      />
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={msgLabel}
        rows={2}
        className="rounded-2xl border bg-white px-5 py-3 text-sm"
        style={{ borderColor: "var(--kt-line)" }}
      />
      <button
        type="button"
        disabled={busy || !title.trim()}
        onClick={() => {
          setBusy(true);
          sendNotification(userId, title, message)
            .then(() => {
              setTitle("");
              setMessage("");
              setSent(true);
              window.setTimeout(() => setSent(false), 2500);
            })
            .catch((ex: unknown) => onError(ex instanceof Error ? ex.message : "error"))
            .finally(() => setBusy(false));
        }}
        className="btn btn-secondary self-start disabled:opacity-60"
        style={{ minHeight: 44 }}
      >
        {sent ? sentLabel : sendLabel}
      </button>
    </div>
  );
}

function PartTitle({ slug, idx, lang }: { slug: string; idx: number; lang: "en" | "ar" }) {
  const [title, setTitle] = useState(`#${idx + 1}`);
  useEffect(() => {
    void import("../store").then((m) => {
      const raw = m.getRawCourse(slug);
      const t = raw?.modules?.[lang]?.[idx]?.t ?? raw?.modules?.en?.[idx]?.t;
      if (t) setTitle(t);
    }).catch(() => {
      /* keep fallback */
    });
  }, [slug, idx, lang]);
  return <>{title}</>;
}

/**
 * Admin user search + enrollment management.
 * Search runs ONLY on explicit submit (exact match, no scans, no wildcards).
 * All mutations are admin-gated server-side via RLS.
 */
export function UsersManager() {
  const { lang, t } = useLang();
  const u = t.admin.users;
  useContent();
  const courses = loadStore().courses;
  const [kind, setKind] = useState<SearchKind>("phone");
  const [term, setTerm] = useState("");
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const [found, setFound] = useState<FoundUser | null>(null);
  const [err, setErr] = useState("");
  const [grantSlug, setGrantSlug] = useState("");
  const [orphans, setOrphans] = useState<Orphan[] | null>(null);
  const [orphanBusy, setOrphanBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadOrphans = async () => {
    if (orphanBusy) return;
    setOrphanBusy(true);
    setErr("");
    try {
      setOrphans(await listOrphans());
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "error");
    } finally {
      setOrphanBusy(false);
    }
  };

  const copyCleanupSql = async () => {
    if (!orphans || orphans.length === 0) return;
    const sql = `delete from auth.users where id in (\n${orphans.map((o) => `  '${o.user_id}'`).join(",\n")}\n);`;
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setErr(sql);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !term.trim()) return;
    setBusy(true);
    setErr("");
    setSearched(false);
    try {
      const r = await searchUser(kind, term);
      setFound(r);
      setSearched(true);
      if (r) {
        const first = courses.find((c) => !r.enrolled.includes(c.slug))?.slug ?? "";
        setGrantSlug(first);
      }
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "error");
    } finally {
      setBusy(false);
    }
  };

  const refresh = async (userId: string, k: SearchKind, v: string) => {
    try {
      const r = await searchUser(k, v);
      setFound(r);
    } catch {
      /* keep stale card */
    }
    void userId;
  };

  const act = async (fn: () => Promise<unknown>, after?: (out: unknown) => void) => {
    setErr("");
    try {
      const out = await fn();
      after?.(out);
      await refresh(found?.id ?? "", kind, term);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "error");
    }
  };

  const courseName = (slug: string) => {
    const c = courses.find((x) => x.slug === slug);
    return c ? c.name[lang] ?? c.name.en : slug;
  };

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
        {u.title}
      </h1>

      <form onSubmit={submit} className="flex flex-wrap gap-2 rounded-[20px] border bg-white p-4" style={{ borderColor: "var(--kt-line)" }}>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as SearchKind)}
          aria-label={u.searchBy}
          className="min-h-[44px] rounded-full border bg-white px-4 text-sm font-bold"
          style={{ borderColor: "var(--kt-line)" }}
        >
          <option value="phone">{u.byPhone}</option>
          <option value="email">{u.byEmail}</option>
          <option value="national_id">{u.byNationalId}</option>
        </select>
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={u.searchPh}
          dir="ltr"
          className="min-h-[44px] min-w-0 flex-1 rounded-full border bg-white px-5 text-[15px]"
          style={{ borderColor: "var(--kt-line)" }}
        />
        <button type="submit" disabled={busy} className="btn btn-primary disabled:opacity-60" style={{ minHeight: 44 }}>
          {u.searchGo}
        </button>
      </form>

      {err !== "" && (
        <p role="alert" className="text-sm font-bold" style={{ color: "#B3261E" }}>{err}</p>
      )}
      {searched && !found && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>{u.noUser}</p>
      )}

      {found && (
        <div className="grid gap-4 rounded-[20px] border bg-white p-6" style={{ borderColor: "var(--kt-line)" }}>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>{found.name}</h2>
            {found.banned && (
              <span className="rounded-full px-3 py-1 text-xs font-bold text-white" style={{ background: "#B3261E" }}>
                {u.bannedBadge}
              </span>
            )}
            <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: "var(--surface)", color: "var(--muted)" }}>
              {found.role}
            </span>
          </div>
          {/* Two columns both langs: details first, enrolled second.
              RTL flips sides automatically, direction stays native. */}
          <div className="grid gap-6 lg:grid-cols-2">
            <dl className="grid content-start gap-x-6 gap-y-4 text-sm sm:grid-cols-2" style={{ textAlign: lang === "ar" ? "right" : "left" }}>
              {[
                { label: "Email", value: found.email },
                { label: u.byPhone, value: found.phone ?? "—" },
                { label: u.byNationalId, value: found.national_id ?? "—" },
                { label: "Tracks", value: found.tracks.join(", ") || "—" },
              ].map((f) => (
                <div key={f.label} className="min-w-0">
                  <dt className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--muted)" }}>{f.label}</dt>
                  <dd dir="auto" className="mt-0.5 font-bold" style={{ overflowWrap: "anywhere" }}>{f.value}</dd>
                </div>
              ))}
            </dl>

            <div>
              <h3 className="font-bold" style={{ fontFamily: "var(--font-display)", textAlign: lang === "ar" ? "right" : "left" }}>{u.enrolledL}</h3>
            {found.enrolled.length === 0 ? (
              <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>{u.noneYet}</p>
            ) : (
              <ul className="mt-2 grid gap-2">
                {found.enrolled.map((slug) => (
                  <CoursePartsRow
                    key={slug}
                    slug={slug}
                    courseName={courseName(slug)}
                    userId={found.id}
                    lang={lang}
                    revokeLabel={u.revoke}
                    resetLabel={u.resetViews}
                    confirmReset={u.confirmResetViews}
                    onRevoke={() => void act(() => revokeEnrollment(found.id, slug))}
                  />
                ))}
              </ul>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <AlphaCoursePicker
                courses={courses.filter((c) => !found.enrolled.includes(c.slug))}
                lang={lang}
                value={grantSlug}
                placeholder={u.grantL}
                onPick={setGrantSlug}
              />
              <button
                type="button"
                disabled={!grantSlug}
                onClick={() => grantSlug && void act(() => grantEnrollment(found.id, grantSlug))}
                className="btn btn-primary disabled:opacity-60"
                style={{ minHeight: 44 }}
              >
                {u.grantBtn}
              </button>
            </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 border-t pt-4" style={{ borderColor: "var(--kt-line)" }}>
            <button
              type="button"
              onClick={() => {
                if (!window.confirm(found.banned ? u.confirmUnban : u.confirmBan)) return;
                void act(() => setBanned(found.id, !found.banned));
              }}
              className="btn btn-secondary"
              style={{ minHeight: 44 }}
            >
              {found.banned ? u.unban : u.ban}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!window.confirm(u.confirmDelUser)) return;
                void act(() => deleteProfile(found.id), () => {
                  // Same-device freshness: drop every local view/done/unlock
                  // trace so a re-register starts at absolute zero.
                  void import("../watch").then((w) => w.purgeAllProgress(found.email)).catch(() => {
                    /* server wipe already succeeded */
                  });
                  setFound(null);
                  setSearched(false);
                  setTerm("");
                });
              }}
              className="btn btn-secondary"
              style={{ minHeight: 44, color: "#B3261E" }}
            >
              {u.delUser}
            </button>
          </div>
          <NotifyBox
            userId={found.id}
            titleLabel={u.notifyTitle}
            msgLabel={u.notifyMsg}
            sendLabel={u.notifySend}
            sentLabel={u.notifySent}
            onError={setErr}
          />
        </div>
      )}

      <div className="grid gap-3 rounded-[20px] border bg-white p-6" style={{ borderColor: "var(--kt-line)" }}>
        <div>
          <h2 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>{u.orphansT}</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>{u.orphansD}</p>
        </div>
        <div>
          <button
            type="button"
            onClick={() => void loadOrphans()}
            disabled={orphanBusy}
            className="btn btn-secondary disabled:opacity-60"
            style={{ minHeight: 44 }}
          >
            {u.loadOrphans}
          </button>
        </div>
        {orphans !== null && (
          orphans.length === 0 ? (
            <p className="text-sm font-bold" style={{ color: "var(--kt-teal)" }}>{u.noneOrphans}</p>
          ) : (
            <div className="grid gap-2">
              <ul className="grid gap-2">
                {orphans.map((o) => (
                  <li key={o.user_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl p-3 text-sm" style={{ background: "var(--surface)" }}>
                    <span dir="ltr" className="font-bold">{o.email}</span>
                    <span style={{ color: "var(--muted)" }}>{new Date(o.created_at).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => void copyCleanupSql()}
                className="btn btn-secondary self-start"
                style={{ minHeight: 44 }}
              >
                {copied ? u.copied : u.copySql}
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
}
