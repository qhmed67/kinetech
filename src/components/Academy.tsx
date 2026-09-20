import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { useOutsideClick } from "@/hooks/use-outside-click";
import { COURSE_PHOTOS } from "../course-media";
import { COURSE_SLUGS } from "../router";
import { useLang } from "./lang";

const WA = "https://wa.me/201042031062";
const SRCS = COURSE_PHOTOS;

export function Academy() {
  const { lang, t } = useLang();
  const a = t.academy;
  const [focused, setFocused] = useState<number | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ down: false, startX: 0, startScroll: 0, moved: false });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActive(null);
    };
    if (active !== null) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [active ]);

  useOutsideClick(modalRef, () => setActive(null));

  const openCard = (e: React.SyntheticEvent, i: number) => {
    if (drag.current.moved) return;
    if ((e.target as HTMLElement).closest("a")) return;
    setActive(i);
  };

  const scrollBy = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>(":scope > article");
    const step = card ? card.offsetWidth + 24 : 360;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const el = trackRef.current;
    if (!el) return;
    drag.current = {
      down: true,
      startX: e.clientX,
      startScroll: el.scrollLeft,
      moved: false,
    };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const el = trackRef.current;
    if (!el || !drag.current.down) return;
    const dx = e.clientX - drag.current.startX;
    if (Math.abs(dx) > 6) drag.current.moved = true;
    el.scrollLeft = drag.current.startScroll - dx;
  };
  const endDrag = () => {
    drag.current.down = false;
  };
  const suppressClick = (e: React.SyntheticEvent) => {
    if (drag.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      drag.current.moved = false;
    }
  };

  return (
    <section
      className="section overflow-hidden"
      data-od-id="academy"
      id="academy"
      aria-labelledby="academy-h"
    >
      <div className="kt-wrap">
        <div className="row-between" style={{ flexWrap: "wrap" }}>
          <div>
            <p className="eyebrow">{a.eyebrow}</p>
            <h2 id="academy-h" style={{ fontSize: "var(--fs-h2)" }}>
              {a.h2}
            </h2>
            <a
              href="#/baccalaureate"
              className="mt-3 inline-block text-[15px] font-bold"
              style={{ color: "var(--accent)" }}
            >
              {a.bacLink}
            </a>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => scrollBy(-1)}
              aria-label={lang === "ar" ? "السابق" : "Previous courses"}
              className="arrowbtn"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="h-5 w-5 rtl:rotate-180">
                <path d="M15 5l-7 7 7 7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => scrollBy(1)}
              aria-label={lang === "ar" ? "التالي" : "Next courses"}
              className="arrowbtn next"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="h-5 w-5 rtl:rotate-180">
                <path d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="kt-wrap mt-8">
        <div
          ref={trackRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={() => {
            endDrag();
            setFocused(null);
          }}
          onClickCapture={suppressClick}
          className="noscroll flex cursor-grab snap-x snap-mandatory gap-6 overflow-x-auto pb-2 active:cursor-grabbing"
          style={{ scrollbarWidth: "none" } as React.CSSProperties}
        >
          {a.courses.map((c, i) => {
            const dimmed = focused !== null && focused !== i;
            return (
              <motion.article
                key={c.name}
                layoutId={`course-card-${i}-${uid}`}
                onClick={(e) => openCard(e, i)}
                onMouseEnter={() => setFocused(i)}
                onMouseLeave={() => setFocused(null)}
                onFocus={() => setFocused(i)}
                onBlur={() => setFocused(null)}
                className="w-[82vw] max-w-[340px] flex-none cursor-pointer snap-center overflow-hidden rounded-[22px] border bg-white transition-all duration-300 ease-out motion-reduce:transition-none"
                style={{
                  borderColor: "var(--kt-line)",
                  filter: dimmed ? "blur(2px)" : "none",
                  transform: dimmed ? "scale(0.98)" : "none",
                  opacity: dimmed ? 0.8 : 1,
                }}
              >
                <div className="h-56 overflow-hidden">
                  <motion.img
                    layoutId={`course-img-${i}-${uid}`}
                    src={SRCS[i]}
                    alt={c.name}
                    width={500}
                    height={500}
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    className="pointer-events-none h-full w-full object-cover object-top"
                  />
                </div>
                <div className="flex flex-col gap-2 p-6">
                  <motion.p
                    layoutId={`course-desig-${i}-${uid}`}
                    className="text-[11px] font-bold uppercase tracking-[0.12em]"
                    style={{
                      color: "var(--accent)",
                      fontFamily: "var(--font-display)",
                    }}
                  >
                    {c.designation}
                  </motion.p>
                  <motion.h3
                    layoutId={`course-title-${i}-${uid}`}
                    className="text-xl font-bold"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {c.name}
                  </motion.h3>
                  <p
                    className="line-clamp-3 text-sm leading-relaxed"
                    style={{ color: "var(--muted)" }}
                  >
                    {c.quote}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-4">
                    <a
                      href={WA}
                      className="btn btn-primary self-start"
                      draggable={false}
                    >
                      {a.ctas[i]}
                    </a>
                    <a
                      href={`#/courses/${COURSE_SLUGS[i]}`}
                      className="text-sm font-bold"
                      style={{ color: "var(--accent)" }}
                    >
                      {t.catalog.details}
                    </a>
                  </div>
                </div>
              </motion.article>
            );
          })}
        </div>
      </div>

      {/* expanded card */}
      <AnimatePresence>
        {active !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] h-full w-full bg-black/25 backdrop-blur-[6px]"
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {active !== null ? (
          <div className="fixed inset-0 z-[100] grid place-items-center p-4">
            <button
              type="button"
              aria-label={lang === "ar" ? "إغلاق" : "Close"}
              onClick={() => setActive(null)}
              className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white shadow-lg"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="h-4 w-4 text-black">
                <path d="M18 6l-12 12" />
                <path d="M6 6l12 12" />
              </svg>
            </button>
            <motion.div
              layoutId={`course-card-${active}-${uid}`}
              ref={modalRef}
              className="flex max-h-[90dvh] w-full max-w-[500px] flex-col overflow-hidden rounded-3xl bg-white"
            >
              <motion.img
                layoutId={`course-img-${active}-${uid}`}
                src={SRCS[active]}
                alt={a.courses[active].name}
                width={500}
                height={500}
                className="h-80 w-full shrink-0 object-cover object-top sm:h-96"
              />
              <div className="overflow-y-auto p-6">
                <motion.p
                  layoutId={`course-desig-${active}-${uid}`}
                  className="text-[11px] font-bold uppercase tracking-[0.12em]"
                  style={{
                    color: "var(--accent)",
                    fontFamily: "var(--font-display)",
                  }}
                >
                  {a.courses[active].designation}
                </motion.p>
                <motion.h3
                  layoutId={`course-title-${active}-${uid}`}
                  className="mt-1 text-2xl font-bold"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {a.courses[active].name}
                </motion.h3>
                <p
                  className="mt-2 text-sm leading-relaxed"
                  style={{ color: "var(--muted)" }}
                >
                  {a.courses[active].quote}
                </p>
                <a href={WA} className="btn btn-primary mt-5 w-full">
                  {a.ctas[active]}
                </a>
                <a
                  href={`#/courses/${COURSE_SLUGS[active]}`}
                  className="mt-3 block text-center text-sm font-bold"
                  style={{ color: "var(--accent)" }}
                >
                  {t.catalog.details}
                </a>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
