import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { CheckIcon } from "./bits";
import { useLang } from "./lang";

const WA = "https://wa.me/201042031062";

function Motif({ index, className }: { index: number; className?: string }) {
  const paths = [
    <g key="m">
      <path d="M22 7l-8.5 8.5-5-5L2 17" />
      <path d="M16 7h6v6" />
    </g>,
    <g key="c">
      <path d="M9 9l-5 3 5 3M15 9l5 3-5 3M13 5l-2 14" />
    </g>,
    <g key="p">
      <path d="M4 20l1.2-4.2L16 5l3 3L8.2 18.8 4 20z" />
      <path d="M14.5 6.5l3 3" />
    </g>,
    <g key="g">
      <path d="M12 4L2 9.5 12 15l8-3.4v5.9h2V9.5L12 4z" />
      <path d="M6.5 12.5V17c0 2.5 2.5 4.5 5.5 4.5s5.5-2 5.5-4.5v-4.5L12 15l-5.5-2.5z" />
    </g>,
  ];
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {paths[index % paths.length]}
    </svg>
  );
}

function Chev({ next }: { next?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      className="h-5 w-5 rtl:rotate-180"
    >
      {next ? <path d="M9 5l7 7-7 7" /> : <path d="M15 5l-7 7 7 7" />}
    </svg>
  );
}

export function Services() {
  const { lang, t } = useLang();
  const s = t.services;
  const ar = lang === "ar";
  const slides = useMemo(
    () => [
      { title: s.crsT, desc: s.crsD, items: s.crsI, anchor: "academy", motif: 3 },
      { title: s.mktT, desc: s.mktD, items: s.mktI, anchor: "svc-marketing", motif: 0 },
      { title: s.softT, desc: s.softD, items: s.softI, anchor: "svc-software", motif: 1 },
      { title: s.desT, desc: s.desD, items: s.desI, anchor: "svc-design", motif: 2 },
    ],
    [s],
  );
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

  useEffect(() => {
    if (paused || reduced) return;
    const id = window.setInterval(
      () => setActive((a) => (a + 1) % slides.length),
      5000,
    );
    return () => window.clearInterval(id);
  }, [paused, reduced, slides.length]);

  const go = (dir: 1 | -1) =>
    setActive((a) => (a + dir + slides.length) % slides.length);
  const cur = slides[active];

  return (
    <section
      className="section"
      data-od-id="services-detail"
      id="services"
      aria-labelledby="svc-h"
      style={{
        background: "var(--surface)",
        borderTop: "1px solid var(--kt-line)",
        borderBottom: "1px solid var(--kt-line)",
      }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <span id="svc-marketing" aria-hidden="true" />
      <span id="svc-software" aria-hidden="true" />
      <span id="svc-design" aria-hidden="true" />
      <div className="kt-wrap grid items-center gap-12 md:grid-cols-2">
        {/* info side */}
        <div>
          <p className="eyebrow">{s.eyebrow}</p>
          <h2 id="svc-h" style={{ fontSize: "var(--fs-h2)" }}>
            {s.h2}
          </h2>
          <div className="mt-6 min-h-[220px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={active + lang}
                initial={{ opacity: 0, y: reduced ? 0 : 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reduced ? 0 : -16 }}
                transition={{ duration: reduced ? 0 : 0.35, ease: "easeOut" }}
              >
                <p
                  className="text-sm font-bold"
                  style={{ color: "var(--accent)" }}
                >
                  {String(active + 1).padStart(2, "0")} /{" "}
                  {String(slides.length).padStart(2, "0")}
                </p>
                <h3
                  className="mt-2 text-3xl font-bold"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {cur.title}
                </h3>
                <p
                  className="mt-3 max-w-[46ch] text-[15px] leading-relaxed"
                  style={{ color: "var(--muted)" }}
                >
                  {cur.desc}
                </p>
                <div
                  style={{ display: "grid", gap: 12, marginTop: 18 }}
                  id={cur.anchor}
                >
                  {cur.items.map((item) => (
                    <div className="checkrow" key={item}>
                      <span className="badge-dot">
                        <CheckIcon />
                      </span>
                      {item}
                    </div>
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="mt-7 hidden flex-wrap items-center gap-3 md:flex">
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label={ar ? "الخدمة السابقة" : "Previous service"}
              className="arrowbtn"
            >
              <Chev />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label={ar ? "الخدمة التالية" : "Next service"}
              className="arrowbtn next"
            >
              <Chev next />
            </button>
            <a
              className="btn btn-primary ms-2"
              href={WA}
              data-od-id="svc-cta"
            >
              {s.noteCta}
            </a>
          </div>
        </div>

        {/* phone side */}
        <div className="flex justify-center" aria-hidden="true">
          <div
            className="relative w-[280px] rounded-[48px] bg-black p-[11px] sm:w-[305px]"
            style={{
              boxShadow:
                "0 32px 64px -28px color-mix(in oklch, var(--kt-deep) 55%, transparent)",
            }}
          >
            {/* side buttons: volume up/down + power */}
            <span aria-hidden="true" className="absolute -left-[3px] top-40 h-14 w-[3px] rounded-full bg-black" />
            <span aria-hidden="true" className="absolute -left-[3px] top-56 h-14 w-[3px] rounded-full bg-black" />
            <span aria-hidden="true" className="absolute -right-[3px] top-44 h-14 w-[3px] rounded-full bg-black" />
            <div className="relative overflow-hidden rounded-[36px] bg-white">
              {/* status bar + notch */}
              <div dir="ltr" className="relative flex items-center justify-between px-5 pt-4 text-black">
                <span
                  className="num ms-1 text-[13.5px] font-bold"
                  style={{
                    fontFamily:
                      "-apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,sans-serif",
                  }}
                >
                  9:41
                </span>
                <span className="flex items-center gap-1.5">
                  <svg width="17" height="12" viewBox="0 0 17 12" fill="currentColor" aria-hidden="true">
                    <rect x="0" y="7" width="3" height="5" rx="1" />
                    <rect x="4.5" y="5" width="3" height="7" rx="1" />
                    <rect x="9" y="2.5" width="3" height="9.5" rx="1" />
                    <rect x="13.5" y="0" width="3" height="12" rx="1" />
                  </svg>
                  <svg width="16" height="12" viewBox="0 0 16 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                    <path d="M1.8 4.6a8.6 8.6 0 0 1 12.4 0" />
                    <path d="M4 7a5.6 5.6 0 0 1 8 0" />
                    <circle cx="8" cy="9.8" r="1.3" fill="currentColor" stroke="none" />
                  </svg>
                  <svg width="25" height="12" viewBox="0 0 27 12" fill="none" aria-hidden="true">
                    <rect x="0.5" y="0.5" width="22" height="11" rx="3.5" stroke="currentColor" opacity=".45" />
                    <rect x="2.5" y="2.5" width="15.5" height="7" rx="2" fill="currentColor" />
                    <rect x="24" y="3.5" width="2.5" height="5" rx="1.2" fill="currentColor" opacity=".45" />
                  </svg>
                </span>
              </div>
              <div dir="ltr" className="absolute left-1/2 top-2.5 flex h-[24px] w-[68px] -translate-x-1/2 items-center justify-end rounded-full bg-black pe-2">
                <span
                  aria-hidden="true"
                  className="h-3 w-3 rounded-full"
                  style={{ background: "#1b1b1f", border: "1.5px solid #5a5a62" }}
                />
              </div>
              {/* screen content */}
              <div className="relative flex min-h-[540px] flex-col overflow-hidden px-4 pb-4 pt-5" style={{ background: "#F6F6F8" }}>
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 opacity-70"
                  style={{
                    backgroundImage:
                      "radial-gradient(rgba(26,26,26,.07) 1px, transparent 1px)",
                    backgroundSize: "16px 16px",
                  }}
                />
                <AnimatePresence mode="wait">
                  <motion.div
                    key={active + lang}
                    initial={{ opacity: 0, y: reduced ? 0 : 32 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: reduced ? 0 : -24 }}
                    transition={{ duration: reduced ? 0 : 0.35, ease: "easeOut" }}
                    className="relative flex flex-1 flex-col gap-3"
                  >
                    <div className="flex items-center gap-2 px-1">
                      <span
                        className="rounded-full px-2.5 py-1 text-[11px] font-bold text-white"
                        style={{
                          background: "var(--kt-deep)",
                          fontFamily: "var(--font-display)",
                        }}
                      >
                        {String(active + 1).padStart(2, "0")}
                      </span>
                      <p
                        className="text-[14px] font-bold"
                        style={{
                          color: "var(--accent)",
                          fontFamily: "var(--font-display)",
                        }}
                      >
                        {cur.title}
                      </p>
                    </div>
                    {/* app-preview visual */}
                    <motion.div
                      initial={{ opacity: 0, scale: reduced ? 1 : 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: reduced ? 0 : 0.35, ease: "easeOut" }}
                      className="relative flex h-40 items-center justify-center overflow-hidden rounded-2xl"
                      style={{
                        color:
                          active % 4 === 1
                            ? "var(--kt-deep)"
                            : "var(--accent)",
                        background:
                          active % 4 === 0
                            ? "color-mix(in oklch, var(--accent) 16%, white)"
                            : active % 4 === 1
                              ? "color-mix(in oklch, var(--kt-teal) 20%, white)"
                              : active % 4 === 2
                                ? "color-mix(in oklch, var(--kt-mid) 18%, white)"
                                : "color-mix(in oklch, var(--kt-deep) 12%, white)",
                      }}
                    >
                      <Motif
                        index={cur.motif}
                        className="h-20 w-20"
                      />
                      <motion.div
                        animate={{ y: reduced ? 0 : [0, -7, 0] }}
                        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                        className="absolute end-3 top-3 rounded-xl bg-white/90 px-2.5 py-1.5 shadow-sm"
                      >
                        <div className="skel h-2 w-14" />
                        <div className="skel mt-1.5 h-2 w-9" />
                      </motion.div>
                      <motion.div
                        animate={{ y: reduced ? 0 : [0, 6, 0] }}
                        transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
                        className="absolute bottom-3 start-3 flex items-center gap-1.5 rounded-xl bg-white/90 px-2.5 py-1.5 shadow-sm"
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: "var(--accent)" }}
                        />
                        <div className="skel h-2 w-16" />
                      </motion.div>
                    </motion.div>
                    {/* skeleton rows */}
                    <div className="grid gap-2 px-1" aria-hidden="true">
                      <div className="skel h-3 w-11/12" />
                      <div className="skel h-3 w-3/4" />
                      <div className="skel h-3 w-4/5" />
                    </div>
                    {/* skeleton tiles */}
                    <div className="grid grid-cols-3 gap-2 px-1" aria-hidden="true">
                      <div className="skel h-16 rounded-xl" />
                      <div className="skel h-16 rounded-xl" />
                      <div className="skel h-16 rounded-xl" />
                    </div>
                    <div className="grid gap-2 px-1" aria-hidden="true">
                      <div className="skel h-3 w-2/3" />
                      <div className="skel h-3 w-1/2" />
                    </div>
                    <nav
                      aria-label={ar ? "الخدمات" : "Services"}
                      className="mt-auto flex items-center gap-1 rounded-2xl border border-neutral-100 bg-white p-1.5"
                      style={{
                        boxShadow: "0 12px 24px -16px rgba(26,26,26,.3)",
                      }}
                    >
                      {slides.map((sl, i) => (
                        <button
                          key={sl.title}
                          type="button"
                          onClick={() => setActive(i)}
                          aria-label={sl.title}
                          aria-current={i === active ? "true" : undefined}
                          className="grid h-11 flex-1 place-items-center rounded-xl transition-colors duration-200"
                          style={
                            i === active
                              ? {
                                  background: "var(--kt-deep)",
                                  color: "#fff",
                                }
                              : { color: "rgba(26,26,26,.3)" }
                          }
                        >
                          <Motif index={sl.motif} className="h-5 w-5" />
                        </button>
                      ))}
                    </nav>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
        {/* mobile controls — thumb-first, below the phone */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3 md:hidden">
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label={ar ? "الخدمة السابقة" : "Previous service"}
            className="arrowbtn"
          >
            <Chev />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label={ar ? "الخدمة التالية" : "Next service"}
            className="arrowbtn next"
          >
            <Chev next />
          </button>
          <a
            className="btn btn-primary ms-2"
            href={WA}
            data-od-id="svc-cta-mobile"
          >
            {s.noteCta}
          </a>
        </div>
      </div>
    </section>
  );
}
