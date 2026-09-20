import { useEffect, useRef, useState } from "react";
import { getCourse, useContent } from "../store";
import { useLang } from "../components/lang";
const WA = "https://wa.me/201042031062";

function FactIcon({ path }: { path: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--kt-teal)"
      strokeWidth="2"
      aria-hidden="true"
      className="h-5 w-5 flex-none"
    >
      <path d={path} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CourseDetail({ slug }: { slug: string }) {
  const { lang, t } = useLang();
  const d = t.detail;
  useContent();
  const course = getCourse(lang, slug);
  const price = course?.price ?? d.contactPricing;
  const topRef = useRef<HTMLDivElement>(null);
  const [past, setPast] = useState(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem("kt-watch-denied")) {
        setDenied(true);
        window.sessionStorage.removeItem("kt-watch-denied");
      }
    } catch {
      /* ignore */
    }
  }, [slug]);

  useEffect(() => {
    const el = topRef.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => setPast(!e.isIntersecting), {
      threshold: 0,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (!course) return null;

  const facts = [
    {
      label: d.duration,
      value: course.duration,
      icon: "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
    },
    {
      label: d.lessons,
      value: course.lessons,
      icon: "M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 5.5v15",
    },
    {
      label: d.scheduleL,
      value: course.schedule,
      icon: "M8 3v4M16 3v4M4 9h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z",
    },
  ];

  return (
    <main id="content" className="section" style={{ paddingTop: 20 }}>
      <div className="kt-wrap">
        <a
          href="#/courses"
          className="text-sm font-bold"
          style={{ color: "var(--accent)" }}
        >
          {d.back}
        </a>
        {denied && (
          <p
            role="alert"
            className="mt-4 rounded-2xl border px-5 py-3.5 text-sm font-bold"
            style={{ borderColor: "#B3261E", background: "#FDECEA", color: "#B3261E" }}
          >
            {d.denied}
          </p>
        )}

        {/* TOP — image / info */}
        <div ref={topRef} className="mt-6 grid items-start gap-10 md:grid-cols-2 md:items-center">
          <div>
            {course.bac && (
              <span
                className="mb-3 inline-block rounded-full px-3.5 py-1.5 text-xs font-bold"
                style={{
                  background: "var(--teal-soft)",
                  color: "var(--kt-deep)",
                  fontFamily: "var(--font-display)",
                }}
              >
                {t.catalog.catBac}
              </span>
            )}
            <img
              src={course.photoDetail}
              alt={course.name}
              className="w-full rounded-[20px] object-contain"
              style={{ background: "var(--surface)" }}
            />
          </div>

          <div>
            <h1
              className="text-3xl font-bold md:text-4xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {course.name}
            </h1>
            <p className="mt-3 leading-relaxed" style={{ color: "var(--muted)" }}>
              {course.quote}
            </p>

            <dl className="mt-7 space-y-3.5">
              {facts.map((f) => (
                <div key={f.label} className="flex items-center gap-3">
                  <FactIcon path={f.icon} />
                  <dt className="text-sm" style={{ color: "var(--muted)" }}>
                    {f.label}
                  </dt>
                  <dd
                    className="font-bold"
                    dir="auto"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {f.value}
                  </dd>
                </div>
              ))}
            </dl>

            <p
              className="mt-8 text-xs font-bold uppercase tracking-[0.12em]"
              style={{ color: "var(--muted)", fontFamily: "var(--font-display)" }}
            >
              {d.priceL}
            </p>
            <p
              className="mt-1 text-4xl font-bold md:text-5xl"
              dir="auto"
              style={{
                color: "var(--accent)",
                fontFamily: "var(--font-display)",
                letterSpacing: "-0.02em",
              }}
            >
              {price}
            </p>
            <a
              href={WA}
              className="btn btn-primary mt-5 w-full sm:w-auto"
              style={{ padding: "14px 40px", fontSize: 16 }}
            >
              {d.enroll}
            </a>
          </div>
        </div>

        {/* CURRICULUM + WHAT YOU GET */}
        <div className="mx-auto mt-16 grid max-w-5xl gap-12 md:grid-cols-2">
        <section>
          <h2
            className="text-2xl font-bold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {d.curriculum}
          </h2>
          <div className="mt-2 divide-y divide-[var(--kt-line)]">
            {course.modules.map((m) => (
              <div key={m.t} className="py-4">
                <h3
                  className="font-bold"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {m.t}
                </h3>
                <p
                  className="mt-1 text-[15px] leading-relaxed"
                  style={{ color: "var(--muted)" }}
                >
                  {m.d}
                </p>
              </div>
            ))}
          </div>
        </section>
        <section>
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="grid h-12 w-12 flex-none place-items-center rounded-full text-lg font-bold"
              style={{
                background: "var(--surface)",
                color: "var(--accent)",
                fontFamily: "var(--font-display)",
              }}
            >
              {course.instructor.name.replace(/^(ENG\/|م\/)\s*/, "").trim().charAt(0)}
            </span>
            <div>
              <p className="font-bold" style={{ fontFamily: "var(--font-display)" }}>
                {course.instructor.name}
              </p>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                {course.instructor.spec}
              </p>
            </div>
          </div>
          {course.outcomes.length > 0 && (
          <>
          <h2
            className="mt-8 text-2xl font-bold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {d.includesT}
          </h2>
          <ul className="mt-4 grid gap-2.5">
            {course.outcomes.map((o) => (
              <li key={o} className="flex items-start gap-2.5 text-[15px]">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--kt-teal)"
                  strokeWidth="3"
                  aria-hidden="true"
                  className="mt-1 h-4 w-4 flex-none"
                >
                  <path d="M4 12.5 9.5 18 20 6.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {o}
              </li>
            ))}
          </ul>
          </>
          )}
        </section>
        </div>
      </div>

      {/* slim sticky enroll — only after scrolling past the top */}
      <div
        aria-hidden={!past}
        className={`fixed inset-x-0 bottom-0 z-30 border-t bg-white/95 backdrop-blur transition-transform duration-300 ${
          past ? "" : "translate-y-full"
        }`}
        style={{ borderColor: "var(--kt-line)" }}
      >
        <div className="kt-wrap flex items-center gap-3 py-2.5">
          <p className="min-w-0 flex-1 truncate text-sm">
            <strong style={{ fontFamily: "var(--font-display)" }}>
              {course.name}
            </strong>{" "}
            <span style={{ color: "var(--muted)" }}>·</span>{" "}
            <span
              className="font-bold"
              dir="auto"
              style={{ color: "var(--accent)" }}
            >
              {price}
            </span>
          </p>
          <a
            href={WA}
            tabIndex={past ? 0 : -1}
            className="btn btn-primary flex-none"
            style={{ minHeight: 40, padding: "8px 22px", fontSize: 14 }}
          >
            {d.enroll}
          </a>
        </div>
      </div>
    </main>
  );
}
