import { useEffect, useState } from "react";
import { COURSE_PHOTOS } from "../course-media";
import { COURSE_SLUGS } from "../router";
import { initialsOf, type KtUser } from "../auth";
import { useLang } from "../components/lang";

const ENROLLED = [
  { course: 0, progress: 68, hours: 12 },
  { course: 2, progress: 32, hours: 6 },
];
const TABS = ["overview", "courses", "exams", "assignments", "profile", "settings"] as const;
type Tab = (typeof TABS)[number];

function isTab(x: string | undefined): x is Tab {
  return (TABS as readonly string[]).includes(x ?? "");
}

export function Dashboard({
  user,
  onSignout,
  tab,
}: {
  user: KtUser | null;
  onSignout: () => void;
  tab?: string;
}) {
  const { t } = useLang();
  const d = t.dashboard;
  const [active, setActive] = useState<Tab>(isTab(tab) ? tab : "overview");

  useEffect(() => {
    if (!user) window.location.href = "signin.html";
  }, [user]);

  useEffect(() => {
    if (isTab(tab)) setActive(tab);
  }, [tab]);

  if (!user) return null;

  const switchTab = (tb: Tab) => {
    setActive(tb);
    window.location.hash = tb === "overview" ? "#/dashboard" : `#/dashboard/${tb}`;
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
            {d.tabs.map((label, i) => tabBtn(TABS[i], label))}
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
                    { label: d.enrolled, value: String(ENROLLED.length) },
                    { label: d.hours, value: String(ENROLLED.reduce((a, e) => a + e.hours, 0)) },
                    { label: d.streak, value: "6" },
                  ].map((s) => (
                    <div key={s.label} className="rounded-[20px] border bg-white p-5" style={{ borderColor: "var(--kt-line)" }}>
                      <p className="text-sm" style={{ color: "var(--muted)" }}>{s.label}</p>
                      <p className="num mt-1 text-3xl font-bold" dir="ltr" style={{ fontFamily: "var(--font-display)" }}>
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
                        <span className="flex-none text-sm" style={{ color: "var(--muted)" }}>{s.day} · <span className="num" dir="ltr">{s.time}</span></span>
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
                {ENROLLED.map((e) => {
                  const course = t.academy.courses[e.course];
                  return (
                    <article key={e.course} className="flex flex-col gap-4 rounded-[20px] border bg-white p-5 sm:flex-row" style={{ borderColor: "var(--kt-line)" }}>
                      <img src={COURSE_PHOTOS[e.course]} alt={course.name} loading="lazy" className="h-28 w-full rounded-2xl object-cover object-top sm:w-36" />
                      <div className="flex-1">
                        <h3 className="font-bold" style={{ fontFamily: "var(--font-display)" }}>{course.name}</h3>
                        <div className="mt-3 h-2.5 overflow-hidden rounded-full" style={{ background: "var(--surface)" }} role="progressbar" aria-valuenow={e.progress} aria-valuemin={0} aria-valuemax={100}>
                          <div className="h-full rounded-full" style={{ width: `${e.progress}%`, background: "var(--kt-gradient)" }} />
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <span className="num text-sm" dir="ltr" style={{ color: "var(--muted)" }}>{e.progress}% · {e.hours}h</span>
                          <a href={`#/courses/${COURSE_SLUGS[e.course]}`} className="btn btn-secondary" style={{ minHeight: 40, padding: "8px 18px", fontSize: 14 }}>
                            {d.cont}
                          </a>
                        </div>
                      </div>
                    </article>
                  );
                })}
                <a href="#/courses" className="text-[15px] font-bold" style={{ color: "var(--accent)" }}>
                  {d.explore}
                </a>
              </div>
            )}

            {active === "exams" && (
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
            )}

            {active === "assignments" && (
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
    </main>
  );
}
