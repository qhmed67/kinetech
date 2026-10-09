import { useEffect, useRef, useState } from "react";
import { loadStore, useContent, type StoreCourse } from "../store";
import { useLang } from "../components/lang";
import {
  deleteProfile,
  getUserCourseViews,
  grantEnrollment,
  listOrphans,
  resetUserViews,
  revokeEnrollment,
  searchUser,
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
  const [progress, setProgress] = useState<Record<string, { done: number; total: number }>>({});
  const [resetMsg, setResetMsg] = useState<{ slug: string; text: string } | null>(null);

  const loadProgress = async (userId: string, slugs: string[]) => {
    const entries = await Promise.all(
      slugs.map(async (slug) => {
        try {
          return [slug, await getUserCourseViews(userId, slug)] as const;
        } catch {
          return null;
        }
      }),
    );
    const next: Record<string, { done: number; total: number }> = {};
    for (const e of entries) if (e) next[e[0]] = e[1];
    setProgress(next);
  };
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
      setProgress({});
      setResetMsg(null);
      if (r) {
        const first = courses.find((c) => !r.enrolled.includes(c.slug))?.slug ?? "";
        setGrantSlug(first);
        void loadProgress(r.id, r.enrolled);
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
                {found.enrolled.map((slug) => {
                  const pg = progress[slug];
                  return (
                  <li key={slug} className="flex items-center justify-between gap-3 rounded-xl p-3 text-sm" style={{ background: "var(--surface)" }}>
                    <span className="font-bold">
                      {courseName(slug)}
                      {pg && (
                        <span dir="ltr" className="ms-2 font-medium tabular-nums" style={{ color: "var(--muted)" }}>
                          {pg.done}/{pg.total}
                        </span>
                      )}
                    </span>
                    <span className="flex flex-none items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          if (!window.confirm(u.confirmResetViews)) return;
                          setResetMsg(null);
                          void act(
                            async () => {
                              const r = await resetUserViews(found.id, slug);
                              return `${r.deleted}/${r.total}`;
                            },
                            (label) => {
                              setResetMsg(typeof label === "string" ? { slug, text: `✓ ${label}` } : null);
                              void loadProgress(found.id, found.enrolled);
                              window.setTimeout(() => setResetMsg(null), 4000);
                            },
                          );
                        }}
                        className="text-sm font-bold"
                        style={{ color: "var(--accent)" }}
                      >
                        {resetMsg?.slug === slug ? resetMsg.text : u.resetViews}
                      </button>
                      <button
                        type="button"
                        onClick={() => void act(() => revokeEnrollment(found.id, slug))}
                        className="text-sm font-bold"
                        style={{ color: "#B3261E" }}
                      >
                        {u.revoke}
                      </button>
                    </span>
                  </li>
                  );
                })}
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
