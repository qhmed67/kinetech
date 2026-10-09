import { useEffect, useState } from "react";
import { courseExists, getCourse, getVideos, useContent } from "../store";
import { initialsOf, setUser, type KtUser } from "../auth";
import { isDone } from "../watch";
import { SafeImg } from "../components/SafeImg";
import { isSupabaseConfigured } from "../lib/db/env";
import { useLang } from "../components/lang";

const WA = "https://wa.me/201042031062";
const TRACKS = ["courses", "marketing", "programming", "design"] as const;
type Track = (typeof TRACKS)[number];
const TABS_ALL = ["overview", "courses", "exams", "assignments", "profile", "settings"] as const;
type Tab = string;

/** Real coursework links from enrolled courses (no fabricated scores). */
function courseWork(u: KtUser, lang: "en" | "ar"): {
  exams: { key: string; title: string; course: string; href: string; done: boolean; slug: string; idx: number }[];
  assignments: { key: string; title: string; course: string; href: string; done: boolean; slug: string; idx: number }[];
} {
  const exams: ReturnType<typeof courseWork>["exams"] = [];
  const assignments: ReturnType<typeof courseWork>["assignments"] = [];
  for (const slug of u.enrolled ?? []) {
    const course = getCourse(lang, slug);
    if (!course) continue;
    const vids = getVideos(slug);
    course.modules.forEach((m, i) => {
      const v = vids[i];
      if (!v) return;
      const done = isDone(u, slug, i);
      if (v.exam) exams.push({ key: `${slug}:${i}:exam`, title: m.t, course: course.name, href: v.exam, done, slug, idx: i });
      if (v.assign) assignments.push({ key: `${slug}:${i}:assign`, title: m.t, course: course.name, href: v.assign, done, slug, idx: i });
    });
  }
  return { exams, assignments };
}

/** Real progress from local watch state (server-hydrated when online). */
function courseProgress(u: KtUser, slug: string): { progress: number; hours: number; done: number; total: number } {
  const course = getCourse("en", slug);
  const total = course?.modules.length ?? 0;
  if (total === 0 || !u) return { progress: 0, hours: 0, done: 0, total: 0 };
  let done = 0;
  let mins = 0;
  const vids = getVideos(slug);
  for (let i = 0; i < total; i++) {
    if (isDone(u, slug, i)) {
      done += 1;
      mins += vids[i]?.mins ?? 0;
    }
  }
  return { progress: Math.round((done / total) * 100), hours: Math.round((mins / 60) * 10) / 10, done, total };
}

export function Dashboard({
  user,
  onSignout,
  tab,
  ready,
  onUserChange,
}: {
  user: KtUser | null;
  onSignout: () => void;
  tab?: string;
  ready?: boolean;
  onUserChange?: () => void;
}) {
  const { lang, t } = useLang();
  const d = t.dashboard;
  const w = t.watch;
  useContent();
  const [tracks, setTracks] = useState<string[]>(user?.tracks ?? ["courses"]);
  const [modal, setModal] = useState<Track | null>(null);

  // Spaces can change under us (bootstrap adopting server tracks after the
  // first paint) — resync instead of freezing the first snapshot.
  const trackKey = (user?.tracks ?? []).join(",");
  useEffect(() => {
    if (user) setTracks(user.tracks ?? ["courses"]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email, trackKey]);

  const hasCourses = tracks.includes("courses");
  const activeServices = (TRACKS as readonly string[]).filter(
    (tr) => tr !== "courses" && tracks.includes(tr),
  );
  const TABS = [
    "overview",
    "courses",
    ...(hasCourses ? ["exams", "assignments"] : []),
    ...activeServices,
    "profile",
    "settings",
  ];
  const isTab = (x: string | undefined): x is Tab =>
    typeof x === "string" && (TABS as readonly string[]).includes(x);
  const [active, setActive] = useState<Tab>(isTab(tab) ? tab : "overview");
  const [spacesOpen, setSpacesOpen] = useState(false);
  const [sessions, setSessions] = useState<{ id: string; title: string; date: string }[] | null>(null);
  const [notifs, setNotifs] = useState<{ id: string; title: string; message: string; is_read: boolean }[] | null>(null);

  // Re-adopt server grants on open: a course revoked while browsing must
  // disappear (with its local progress purged) instead of showing stale bars.
  useEffect(() => {
    if (!isSupabaseConfigured() || !user) return;
    let alive = true;
    void import("../lib/db/sync")
      .then((m) => m.syncMyGrants())
      .then((changed) => {
        if (alive && changed) onUserChange?.();
      })
      .catch(() => {
        /* offline — local list stays */
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email]);

  // Live activity (server truth). Null = loading; [] = empty state.
  useEffect(() => {
    if (!isSupabaseConfigured() || !user) return;
    let alive = true;
    void import("../lib/db/activityDb")
      .then(async (m) => {
        const [s, n] = await Promise.all([m.getUpcomingSessions(), m.getNotifications()]);
        if (!alive) return;
        setSessions(s);
        setNotifs(n);
        if (n.some((x) => !x.is_read)) {
          void m.markNotificationsRead().then(() => {
            if (alive) setNotifs((cur) => (cur ?? []).map((x) => ({ ...x, is_read: true })));
          });
        }
      })
      .catch(() => {
        /* static fallback stays hidden; cards render empty states */
        if (alive) {
          setSessions((cur) => cur ?? []);
          setNotifs((cur) => cur ?? []);
        }
      });
    return () => {
      alive = false;
    };
  }, [user?.email]);

  const fmtDate = (iso: string): string => {
    try {
      return new Date(iso).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
    } catch {
      return iso;
    }
  };
  const fmtTime = (iso: string): string => {
    try {
      return new Date(iso).toLocaleTimeString(lang === "ar" ? "ar-EG" : "en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };
  const unread = (notifs ?? []).filter((n) => !n.is_read).length;

  useEffect(() => {
    // Wait for cloud bootstrap: a valid server session restores shortly.
    if (ready && !user) window.location.href = "signin.html";
  }, [user, ready]);

  useEffect(() => {
    if (isTab(tab)) setActive(tab);
    else setActive("overview");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, hasCourses]);

  if (!user) return null;

  if (user.banned) {
    return (
      <main id="content" className="section">
        <div className="kt-wrap" style={{ maxWidth: 560 }}>
          <div className="rounded-[20px] border bg-white p-8 text-center" style={{ borderColor: "#B3261E" }}>
            <p className="text-lg font-bold" style={{ fontFamily: "var(--font-display)", color: "#B3261E" }}>{d.bannedT}</p>
            <p className="mx-auto mt-1 max-w-md text-sm" style={{ color: "var(--muted)" }}>{d.bannedD}</p>
            <a href={WA} className="btn btn-primary mt-5">WhatsApp</a>
          </div>
        </div>
      </main>
    );
  }

  // Admin-granted enrollments only (WhatsApp payment verified by staff).
  const enrolledSlugs = (user?.enrolled ?? []).filter(courseExists);
  const work = courseWork({ ...user, enrolled: enrolledSlugs }, lang);
  // Server truth wins for progress: local flags are UI hints only and must
  // never decide (or inflate) what the bar shows. Falls back to local offline.
  const [serverProg, setServerProg] = useState<Record<string, { progress: number; hours: number; done: number; total: number }>>({});
  useEffect(() => {
    if (!isSupabaseConfigured() || !user) return;
    let alive = true;
    void import("../lib/db/watchDb")
      .then(async (m) => {
        const out: Record<string, { progress: number; hours: number; done: number; total: number }> = {};
        for (const slug of enrolledSlugs) {
          try {
            const rows = await m.getWatchStateDb(slug, lang);
            const total = rows.length;
            const doneRows = rows.filter((r) => r.done);
            const mins = doneRows.reduce((a, r) => a + (r.mins || 0), 0);
            out[slug] = {
              progress: total > 0 ? Math.round((doneRows.length / total) * 100) : 0,
              hours: Math.round((mins / 60) * 10) / 10,
              done: doneRows.length,
              total,
            };
          } catch {
            /* keep local fallback for this course */
          }
        }
        if (alive) setServerProg(out);
      })
      .catch(() => {
        /* offline — local fallback stays */
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email, enrolledSlugs.join(",")]);
  // Merge, never overwrite: an empty server answer (fresh grant, RPC hiccup)
  // must not wipe real local progress — take the best of both per field.
  const progBySlug = new Map(
    enrolledSlugs.map((s) => {
      const local = courseProgress(user, s);
      const srv = serverProg[s];
      if (!srv) return [s, local] as const;
      const done = Math.max(local.done, srv.done);
      const total = Math.max(local.total, srv.total);
      const hours = Math.max(local.hours, srv.hours);
      return [s, {
        done,
        total,
        hours,
        progress: total > 0 ? Math.round((done / total) * 100) : 0,
      }] as const;
    }),
  );
  const hours = [...progBySlug.values()].reduce((a, p) => a + p.hours, 0);
  const lessonsDone = [...progBySlug.values()].reduce((a, p) => a + p.done, 0);

  const switchTab = (tb: Tab) => {
    setActive(tb);
    setSpacesOpen(false);
    window.location.hash = tb === "overview" ? "#/dashboard" : `#/dashboard/${tb}`;
  };

  const activate = (tr: Track) => {
    if (tracks.includes(tr)) {
      setModal(null);
      return;
    }
    const next = [...tracks, tr];
    setTracks(next);
    setUser({ ...user, tracks: next });
    // Persist server-side so the space survives across devices (best-effort).
    if (isSupabaseConfigured()) {
      void import("../lib/db/sync")
        .then((m) => m.addTrackToCloud(tr))
        .catch(() => {
          /* offline — local space stays */
        });
    }
    onUserChange?.();
    setModal(null);
    switchTab(tr === "courses" ? "courses" : tr);
  };

  const tabLabel = (tb: string): string => {
    const i = (TABS_ALL as readonly string[]).indexOf(tb);
    if (i >= 0) return d.tabs[i];
    return d.trackNames[tb as Track] ?? tb;
  };
  const tabBtn = (tb: Tab, label: string) => (
    <button
      key={tb}
      type="button"
      onClick={() => switchTab(tb)}
      aria-current={active === tb ? "page" : undefined}
      className="block w-full rounded-xl px-4 py-3 text-start text-sm font-bold transition-colors max-lg:w-auto max-lg:flex-none max-lg:whitespace-nowrap"
      style={
        active === tb
          ? { background: "var(--kt-deep)", color: "#fff" }
          : { color: "var(--muted)" }
      }
    >
      {label}
    </button>
  );

  const spaceRow = (tr: Track) => {
    const isActive = tracks.includes(tr);
    return (
      <button
        key={tr}
        type="button"
        onClick={() => {
          if (!isActive) setModal(tr);
          else switchTab(tr as Tab);
        }}
        aria-pressed={isActive}
        className="flex w-full items-center gap-2.5 rounded-xl px-4 py-2.5 text-start text-sm transition-colors max-lg:w-auto max-lg:flex-none max-lg:whitespace-nowrap"
        style={isActive ? undefined : { opacity: 0.55 }}
      >
        <span
          aria-hidden="true"
          className="grid h-5 w-5 flex-none place-items-center rounded-full text-[10px] font-bold text-white"
          style={{ background: isActive ? "var(--kt-teal)" : "var(--surface)", color: isActive ? "var(--kt-deep)" : "var(--muted)" }}
        >
          {isActive ? "✓" : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="h-3 w-3">
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
          )}
        </span>
        <span className="font-bold" style={{ color: isActive ? "var(--fg)" : "var(--muted)" }}>
          {d.trackNames[tr]}
        </span>
      </button>
    );
  };

  const lockedCard = (title: string, desc: string, cta: string, onCta: () => void) => (
    <div className="rounded-[20px] border bg-white p-8 text-center" style={{ borderColor: "var(--kt-line)" }}>
      <p className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm" style={{ color: "var(--muted)" }}>{desc}</p>
      <button type="button" onClick={onCta} className="btn btn-primary mt-5">
        {cta}
      </button>
    </div>
  );

  return (
    <main id="content" className="section">
      <div className="kt-wrap">
        <div className="flex flex-wrap items-center gap-4">
          <span
            className="grid h-16 w-16 place-items-center rounded-full text-xl font-bold text-white"
            style={{
              background: "var(--accent)",
              fontFamily: "var(--font-display)",
            }}
          >
            {initialsOf(user.name)}
          </span>
          <div>
            <p className="eyebrow" style={{ margin: 0 }}>
              {d.enrolled}
            </p>
            <h1 style={{ fontSize: "var(--fs-h2)" }}>{d.title}</h1>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[240px_1fr]">
          <aside
            className="grid h-fit content-start gap-1 rounded-[20px] border bg-white p-2 sm:p-3 lg:sticky lg:top-24"
            style={{ borderColor: "var(--kt-line)" }}
            aria-label="dashboard"
          >
            <div className="flex flex-wrap items-start gap-1.5 lg:grid lg:overflow-visible">
              {TABS.map((tb) => tabBtn(tb, tabLabel(tb)))}
              <div className="w-full max-lg:w-auto max-lg:flex-none">
                <button
                  type="button"
                  onClick={() => setSpacesOpen((v) => !v)}
                  aria-expanded={spacesOpen}
                  className="block w-full rounded-xl px-4 py-3 text-start text-sm font-bold transition-colors max-lg:whitespace-nowrap"
                  style={spacesOpen ? { background: "var(--kt-deep)", color: "#fff" } : { color: "var(--muted)" }}
                >
                  {d.tracksT}
                </button>
                {spacesOpen && (
                  <div className="mt-1 grid gap-1 rounded-xl p-1 max-lg:min-w-[200px]" style={{ background: "var(--surface)" }}>
                    {TRACKS.map(spaceRow)}
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onSignout}
              className="block w-full rounded-xl px-4 py-3 text-start text-sm font-bold"
              style={{ color: "#B3261E" }}
            >
              {t.nav.signout}
            </button>
          </aside>

          <div>
            {active === "overview" && (
              <div className="grid gap-4">
                <div className="grid grid-cols-3 gap-2 sm:gap-4">
                  {[
                    { label: d.enrolled, value: String(enrolledSlugs.length) },
                    { label: d.hours, value: String(hours) },
                    { label: d.doneLessons, value: String(lessonsDone) },
                  ].map((s) => (
                    <div key={s.label} className="rounded-[20px] border bg-white p-3 sm:p-5" style={{ borderColor: "var(--kt-line)" }}>
                      <p className="text-xs sm:text-sm" style={{ color: "var(--muted)" }}>{s.label}</p>
                      <p className="mt-1 text-xl font-bold sm:text-3xl" dir="ltr" style={{ fontFamily: "var(--font-display)", fontVariantNumeric: "tabular-nums" }}>
                        {s.value}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="rounded-[20px] border bg-white p-6" style={{ borderColor: "var(--kt-line)" }}>
                  <h3 className="font-bold" style={{ fontFamily: "var(--font-display)" }}>{d.sessionsT}</h3>
                  {sessions === null ? (
                    <ul className="mt-3 grid gap-2" aria-label="loading">
                      {[0, 1].map((i) => (
                        <li key={i} className="animate-pulse rounded-xl p-5 text-sm" style={{ background: "var(--surface)" }} />
                      ))}
                    </ul>
                  ) : sessions.length === 0 ? (
                    <p className="mt-3 rounded-xl p-4 text-sm" style={{ background: "var(--surface)", color: "var(--muted)" }}>
                      {d.upcomingEmpty}
                    </p>
                  ) : (
                    <ul className="mt-3 grid gap-2">
                      {sessions.map((s) => (
                        <li key={s.id} className="flex items-center justify-between gap-3 rounded-xl p-3 text-sm" style={{ background: "var(--surface)" }}>
                          <span className="font-bold">{s.title}</span>
                          <span className="flex-none text-sm" style={{ color: "var(--muted)" }}>{fmtDate(s.date)} · <span dir="ltr" style={{ fontFamily: "var(--font-display)", fontVariantNumeric: "tabular-nums" }}>{fmtTime(s.date)}</span></span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="rounded-[20px] border bg-white p-6" style={{ borderColor: "var(--kt-line)" }}>
                  <h3 className="flex items-center gap-2 font-bold" style={{ fontFamily: "var(--font-display)" }}>
                    {d.notifT}
                    {unread > 0 && (
                      <span
                        aria-label={`${unread} unread`}
                        className="grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-xs font-bold text-white"
                        dir="ltr"
                        style={{ background: "var(--accent)", fontVariantNumeric: "tabular-nums" }}
                      >
                        {unread}
                      </span>
                    )}
                  </h3>
                  {notifs === null ? (
                    <ul className="mt-3 grid gap-2" aria-label="loading">
                      {[0, 1].map((i) => (
                        <li key={i} className="animate-pulse rounded-xl p-5 text-sm" style={{ background: "var(--surface)" }} />
                      ))}
                    </ul>
                  ) : notifs.length === 0 ? (
                    <p className="mt-3 rounded-xl p-4 text-sm" style={{ background: "var(--surface)", color: "var(--muted)" }}>
                      {d.notifEmpty}
                    </p>
                  ) : (
                    <ul className="mt-3 grid gap-2">
                      {notifs.map((n) => (
                        <li key={n.id} className="rounded-xl p-3 text-sm" style={{ background: "var(--surface)", opacity: n.is_read ? 0.75 : 1 }}>
                          <span className="block font-bold">{n.title}</span>
                          {n.message && (
                            <span className="mt-0.5 block" style={{ color: "var(--muted)" }}>{n.message}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {active === "courses" && (
              <div className="grid gap-4">
                {!hasCourses ? (
                  lockedCard(d.noCoursesT, d.noCoursesD, d.turnOn, () => setModal("courses"))
                ) : enrolledSlugs.length === 0 ? (
                  <div className="grid gap-4">
                    <p style={{ color: "var(--muted)" }}>{d.noCoursesD}</p>
                    <a href="#/courses" className="text-[15px] font-bold" style={{ color: "var(--accent)" }}>
                      {d.explore}
                    </a>
                  </div>
                ) : (
                  <>
                    {enrolledSlugs.map((slug) => {
                      const course = getCourse(lang, slug);
                      if (!course) return null;
                      const prog = progBySlug.get(slug) ?? { progress: 0, hours: 0 };
                      return (
                        <article key={slug} className="flex flex-col gap-4 rounded-[20px] border bg-white p-5 sm:flex-row" style={{ borderColor: "var(--kt-line)" }}>
                          <SafeImg src={course.photoCard} alt={course.name} className="h-28 w-full rounded-2xl object-cover object-top sm:w-36" />
                          <div className="flex-1">
                            <h3 className="font-bold" style={{ fontFamily: "var(--font-display)" }}>{course.name}</h3>
                            <div className="mt-3 h-2.5 overflow-hidden rounded-full" style={{ background: "var(--surface)" }} role="progressbar" aria-valuenow={prog.progress} aria-valuemin={0} aria-valuemax={100}>
                              <div className="h-full rounded-full" style={{ width: `${prog.progress}%`, background: "var(--kt-gradient)" }} />
                            </div>
                            <div className="mt-3 flex items-center justify-between gap-3">
                              <span className="text-sm" dir="ltr" style={{ color: "var(--muted)", fontFamily: "var(--font-display)", fontVariantNumeric: "tabular-nums" }}>{prog.progress}% · {prog.hours}h</span>
                              <span className="flex gap-2">
                                <a href={`#/courses/${slug}/watch`} className="btn btn-primary" style={{ minHeight: 40, padding: "8px 18px", fontSize: 14 }}>
                                  {w.watchBtn}
                                </a>
                              </span>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                    <a href="#/courses" className="text-[15px] font-bold" style={{ color: "var(--accent)" }}>
                      {d.explore}
                    </a>
                  </>
                )}
              </div>
            )}

            {active === "exams" && (
              enrolledSlugs.length === 0 ? (
                lockedCard(d.examsT, d.lockedTabsD, d.browseCatalog, () => { window.location.hash = "#/courses"; })
              ) : work.exams.length === 0 ? (
                lockedCard(d.examsT, d.emptyWork, d.browseCatalog, () => { window.location.hash = "#/courses"; })
              ) : (
              <div className="grid gap-4">
                {work.exams.map((ex) => (
                  <article
                    key={ex.key}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-[20px] border bg-white p-5"
                    style={{ borderColor: "var(--kt-line)" }}
                  >
                    <div>
                      <h3 className="font-bold" style={{ fontFamily: "var(--font-display)" }}>
                        {ex.title}
                      </h3>
                      <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                        {ex.course}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className="rounded-full px-4 py-1.5 text-sm font-bold"
                        style={
                          ex.done
                            ? { background: "var(--teal-soft)", color: "var(--kt-deep)", fontFamily: "var(--font-display)" }
                            : { background: "var(--surface)", color: "var(--muted)", fontFamily: "var(--font-display)" }
                        }
                      >
                        {ex.done ? d.assignDone : d.assignTodo}
                      </span>
                      <a
                        href={ex.href}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-secondary"
                        style={{ minHeight: 40, padding: "8px 18px", fontSize: 14 }}
                      >
                        {d.revise}
                      </a>
                    </div>
                  </article>
                ))}
              </div>
              )
            )}

            {active === "assignments" && (
              enrolledSlugs.length === 0 ? (
                lockedCard(d.assignT, d.lockedTabsD, d.browseCatalog, () => { window.location.hash = "#/courses"; })
              ) : work.assignments.length === 0 ? (
                lockedCard(d.assignT, d.emptyWork, d.browseCatalog, () => { window.location.hash = "#/courses"; })
              ) : (
              <div className="grid gap-3">
                {work.assignments.map((a) => {
                  const done = a.done;
                  const external = /^(https?:|data:|blob:)/.test(a.href);
                  return (
                    <article
                      key={a.key}
                      aria-label={`${a.title} — ${done ? d.assignDone : d.assignTodo}`}
                      className="flex items-center gap-3 rounded-[20px] border bg-white p-5"
                      style={{ borderColor: "var(--kt-line)" }}
                    >
                      <span
                        aria-hidden="true"
                        className="grid h-7 w-7 flex-none place-items-center rounded-lg font-bold text-white"
                        style={{
                          background: done ? "var(--kt-teal)" : "var(--surface)",
                          color: done ? "var(--kt-deep)" : "var(--muted)",
                        }}
                      >
                        {done ? "✓" : ""}
                      </span>
                      <span className="flex-1">
                        <span className="block font-bold">{a.title}</span>
                        <span className="mt-0.5 block text-sm" style={{ color: "var(--muted)" }}>
                          {a.course}
                        </span>
                      </span>
                      <a
                        href={a.href}
                        {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
                        className="rounded-full px-3 py-1 text-xs font-bold"
                        style={
                          done
                            ? { background: "var(--teal-soft)", color: "var(--kt-deep)" }
                            : { background: "var(--surface)", color: "var(--muted)" }
                        }
                      >
                        {done ? d.assignDone : d.assignTodo}
                      </a>
                    </article>
                  );
                })}
              </div>
              )
            )}

            {activeServices.includes(active) && (
              <div className="rounded-[20px] border bg-white p-6" style={{ borderColor: "var(--kt-line)" }}>
                <h2 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
                  {d.trackNames[active as Track]}
                </h2>
                <p className="mt-2 text-[15px] leading-relaxed" style={{ color: "var(--muted)" }}>
                  {d.trackDesc[active as Track]}
                </p>
                <a href={WA} className="btn btn-primary mt-5">
                  {d.requestService}
                </a>
              </div>
            )}

            {active === "profile" && (
              <div className="rounded-[20px] border bg-white p-6" style={{ borderColor: "var(--kt-line)", maxWidth: 560 }}>
                <div className="flex items-center gap-4">
                  <span className="grid h-16 w-16 place-items-center rounded-full text-xl font-bold text-white" style={{ background: "var(--accent)", fontFamily: "var(--font-display)" }}>
                    {initialsOf(user.name)}
                  </span>
                  <div>
                    <h2 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>{user.name}</h2>
                    <p className="text-sm" dir="ltr" style={{ color: "var(--muted)" }}>{user.email}</p>
                  </div>
                </div>
                <p
                  className="mt-5 rounded-2xl p-4 text-sm leading-relaxed"
                  style={{ background: "var(--surface)", color: "var(--muted)" }}
                >
                  {d.profileLocked}
                </p>
              </div>
            )}

            {active === "settings" && (
              <div className="grid gap-4" style={{ maxWidth: 560 }}>
                <div className="rounded-[20px] border bg-white p-6" style={{ borderColor: "var(--kt-line)" }}>
                  <h3 className="font-bold" style={{ fontFamily: "var(--font-display)" }}>{d.langL}</h3>
                  <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>{d.settingsNote}</p>
                </div>
                <button type="button" onClick={onSignout} className="btn btn-secondary self-start">
                  {t.nav.signout}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 z-[100] grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={d.activateT}>
          <div className="absolute inset-0 bg-black/25 backdrop-blur-[6px]" onClick={() => setModal(null)} />
          <div className="relative w-full max-w-sm rounded-[24px] bg-white p-7">
            <h3 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
              {d.activateT}
            </h3>
            <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
              <strong style={{ fontFamily: "var(--font-display)" }}>{d.trackNames[modal]}</strong>
              {" — "}{d.activateD}
            </p>
            <div className="mt-5 flex gap-3">
              <button type="button" onClick={() => activate(modal)} className="btn btn-primary flex-1">
                {d.activateYes}
              </button>
              <button type="button" onClick={() => setModal(null)} className="btn btn-secondary flex-1">
                {d.activateNo}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
