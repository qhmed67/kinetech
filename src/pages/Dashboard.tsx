import { useEffect, useState } from "react";
import { courseExists, getCourse, useContent } from "../store";
import { initialsOf, setUser, type KtUser } from "../auth";
import { useLang } from "../components/lang";

const WA = "https://wa.me/201042031062";
const TRACKS = ["courses", "marketing", "programming", "design"] as const;
type Track = (typeof TRACKS)[number];
const TABS_ALL = ["overview", "courses", "exams", "assignments", "profile", "settings"] as const;
type Tab = string;
const MOCK_PROG: Record<string, { progress: number; hours: number }> = {
  "python-data": { progress: 68, hours: 12 },
  solidworks: { progress: 32, hours: 6 },
};

export function Dashboard({
  user,
  onSignout,
  tab,
  onUserChange,
}: {
  user: KtUser | null;
  onSignout: () => void;
  tab?: string;
  onUserChange?: () => void;
}) {
  const { lang, t } = useLang();
  const d = t.dashboard;
  const w = t.watch;
  useContent();
  const [tracks, setTracks] = useState<string[]>(user?.tracks ?? ["courses"]);
  const [modal, setModal] = useState<Track | null>(null);

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

  useEffect(() => {
    if (!user) window.location.href = "signin.html";
  }, [user]);

  useEffect(() => {
    if (isTab(tab)) setActive(tab);
    else setActive("overview");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, hasCourses]);

  if (!user) return null;

  const enrolledSlugs = (user.enrolled ?? []).filter(courseExists);
  const hours = enrolledSlugs.reduce((a, s) => a + (MOCK_PROG[s]?.hours ?? 0), 0);

  const switchTab = (tb: Tab) => {
    setActive(tb);
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
      className="block w-full rounded-xl px-4 py-3 text-start text-sm font-bold transition-colors"
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
        className="flex w-full items-center gap-2.5 rounded-xl px-4 py-2.5 text-start text-sm transition-colors"
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
            className="grid h-fit content-start gap-1 rounded-[20px] border bg-white p-3 lg:sticky lg:top-24"
            style={{ borderColor: "var(--kt-line)" }}
            aria-label="dashboard"
          >
            {TABS.map((tb) => tabBtn(tb, tabLabel(tb)))}
            <p className="px-4 pb-1 pt-3 text-xs font-bold uppercase tracking-[0.1em]" style={{ color: "var(--muted)", fontFamily: "var(--font-display)" }}>
              {d.tracksT}
            </p>
            {TRACKS.map(spaceRow)}
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
                <div className="grid gap-4 sm:grid-cols-3">
                  {[
                    { label: d.enrolled, value: String(enrolledSlugs.length) },
                    { label: d.hours, value: String(hours) },
                    { label: d.streak, value: "6" },
                  ].map((s) => (
                    <div key={s.label} className="rounded-[20px] border bg-white p-5" style={{ borderColor: "var(--kt-line)" }}>
                      <p className="text-sm" style={{ color: "var(--muted)" }}>{s.label}</p>
                      <p className="mt-1 text-3xl font-bold" dir="ltr" style={{ fontFamily: "var(--font-display)", fontVariantNumeric: "tabular-nums" }}>
                        {s.value}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="rounded-[20px] border bg-white p-6" style={{ borderColor: "var(--kt-line)" }}>
                  <h3 className="font-bold" style={{ fontFamily: "var(--font-display)" }}>{d.sessionsT}</h3>
                  <ul className="mt-3 grid gap-2">
                    {d.sessions.map((s) => (
                      <li key={s.title} className="flex items-center justify-between gap-3 rounded-xl p-3 text-sm" style={{ background: "var(--surface)" }}>
                        <span className="font-bold">{s.title}</span>
                        <span className="flex-none text-sm" style={{ color: "var(--muted)" }}>{s.day} · <span dir="ltr" style={{ fontFamily: "var(--font-display)", fontVariantNumeric: "tabular-nums" }}>{s.time}</span></span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-[20px] border bg-white p-6" style={{ borderColor: "var(--kt-line)" }}>
                  <h3 className="font-bold" style={{ fontFamily: "var(--font-display)" }}>{d.notifT}</h3>
                  <ul className="mt-3 grid gap-2">
                    {d.notes.map((n) => (
                      <li key={n} className="rounded-xl p-3 text-sm" style={{ background: "var(--surface)" }}>{n}</li>
                    ))}
                  </ul>
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
                      const prog = MOCK_PROG[slug] ?? { progress: 0, hours: 0 };
                      return (
                        <article key={slug} className="flex flex-col gap-4 rounded-[20px] border bg-white p-5 sm:flex-row" style={{ borderColor: "var(--kt-line)" }}>
                          <img src={course.photoCard} alt={course.name} loading="lazy" className="h-28 w-full rounded-2xl object-cover object-top sm:w-36" />
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
              ) : (
              <div className="grid gap-4">
                {d.exams.map((ex) => (
                  <article
                    key={ex.t}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-[20px] border bg-white p-5"
                    style={{ borderColor: "var(--kt-line)" }}
                  >
                    <div>
                      <h3 className="font-bold" style={{ fontFamily: "var(--font-display)" }}>
                        {ex.t}
                      </h3>
                      <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                        {ex.c}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        dir="ltr"
                        className="rounded-full px-4 py-1.5 text-sm font-bold"
                        style={{
                          background: "var(--teal-soft)",
                          color: "var(--kt-deep)",
                          fontFamily: "var(--font-display)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {ex.s}
                      </span>
                      <a
                        href="#/courses"
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
              ) : (
              <div className="grid gap-3">
                {d.assign.map((a) => {
                  const done = a.done;
                  return (
                    <article
                      key={a.t}
                      aria-label={`${a.t} — ${done ? d.assignDone : d.assignTodo}`}
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
                        <span className="block font-bold">{a.t}</span>
                        <span className="mt-0.5 block text-sm" style={{ color: "var(--muted)" }}>
                          {a.c} · {d.assignDue}: {a.due}
                        </span>
                      </span>
                      <span
                        className="rounded-full px-3 py-1 text-xs font-bold"
                        style={
                          done
                            ? { background: "var(--teal-soft)", color: "var(--kt-deep)" }
                            : { background: "var(--surface)", color: "var(--muted)" }
                        }
                      >
                        {done ? d.assignDone : d.assignTodo}
                      </span>
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
