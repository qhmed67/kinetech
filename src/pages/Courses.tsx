import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CardBody, CardContainer, CardItem } from "@/components/ui/3d-card";
import { listCourses, useContent } from "../store";
import { useOutsideClick } from "@/hooks/use-outside-click";
import { useLang } from "../components/lang";

const WA = "https://wa.me/201042031062";

export function Courses() {
  const { lang, t } = useLang();
  const c = t.catalog;
  const v = useContent();
  const all = useMemo(() => listCourses(lang), [lang, v]);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState<number | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 16;

  const filters = [
    { key: "all", label: c.filterAll },
    { key: "bac", label: c.catBac },
    { key: "tech", label: c.catProg },
    { key: "other", label: c.catOther },
  ];
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all
      .map((course, i) => ({ course, i }))
      .filter(({ course }) => {
        if (filter === "bac" && !course.bac) return false;
        if (filter !== "all" && filter !== "bac" && course.cat !== filter)
          return false;
        if (
          needle &&
          !(course.name + " " + course.designation + " " + course.quote)
            .toLowerCase()
            .includes(needle)
        )
          return false;
        return true;
      });
  }, [all, filter, q]);

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
  }, [active]);

  useOutsideClick(modalRef, () => setActive(null));

  const openCard = (e: React.SyntheticEvent, i: number) => {
    if ((e.target as HTMLElement).closest("a")) return;
    setActive(i);
  };

  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const visible = list.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const goPage = (p: number) => {
    setPage(Math.min(pages, Math.max(1, p)));
    setActive(null);
  };

  const activeCourse = active !== null ? all[active] ?? null : null;

  return (
    <main id="content" className="section overflow-hidden">
      <div className="kt-wrap">
        <div className="row-between" style={{ flexWrap: "wrap" }}>
          <div>
            <p className="eyebrow">{c.eyebrow}</p>
            <h1 style={{ fontSize: "var(--fs-h2)" }}>{c.h2}</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => goPage(safePage - 1)}
              disabled={safePage <= 1}
              aria-label={lang === "ar" ? "السابق" : "Previous courses"}
              className="arrowbtn disabled:opacity-30"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="h-5 w-5 rtl:rotate-180">
                <path d="M15 5l-7 7 7 7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => goPage(safePage + 1)}
              disabled={safePage >= pages}
              aria-label={lang === "ar" ? "التالي" : "Next courses"}
              className="arrowbtn next disabled:opacity-30"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="h-5 w-5 rtl:rotate-180">
                <path d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder={c.searchPh}
            aria-label={c.searchPh}
            dir={lang === "ar" ? "rtl" : "ltr"}
            className="min-h-[44px] w-full max-w-xs rounded-full border bg-white px-5 text-[15px]"
            style={{ borderColor: "var(--border)" }}
          />
          <div className="flex flex-wrap gap-2" role="group" aria-label="filter">
            {filters.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => { setFilter(f.key); setPage(1); }}
                aria-pressed={filter === f.key}
                className="rounded-full px-5 py-2.5 text-sm font-bold transition-all"
                style={
                  filter === f.key
                    ? {
                        background: "var(--accent)",
                        color: "#fff",
                        fontFamily: "var(--font-display)",
                      }
                    : {
                        background: "var(--surface)",
                        color: "var(--muted)",
                        fontFamily: "var(--font-display)",
                      }
                }
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="kt-wrap mt-8">
        {list.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>{c.empty}</p>
        ) : (
          <>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {visible.map(({ course, i }) => {
              const dimmed = focused !== null && focused !== i;
              return (
                <motion.article
                  key={course.slug}
                  layoutId={`cat-card-${i}-${uid}`}
                  onClick={(e) => openCard(e, i)}
                  onMouseEnter={() => setFocused(i)}
                  onMouseLeave={() => setFocused(null)}
                  onFocus={() => setFocused(i)}
                  onBlur={() => setFocused(null)}
                  className="cursor-pointer overflow-hidden rounded-[22px] border bg-white transition-all duration-300 ease-out motion-reduce:transition-none"
                  style={{
                    borderColor: "var(--kt-line)",
                    filter: dimmed ? "blur(2px)" : "none",
                    transform: dimmed ? "scale(0.98)" : "none",
                    opacity: dimmed ? 0.8 : 1,
                  }}
                >
                  <CardContainer containerClassName="block w-full p-0" className="block w-full">
                    <CardBody className="block h-auto w-full">
                  <div className="relative h-44 overflow-hidden md:h-56">
                    <motion.img
                      layoutId={`cat-img-${i}-${uid}`}
                      src={course.photoCard}
                      alt={course.name}
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                      className="pointer-events-none h-full w-full object-cover object-top"
                    />
                    {course.bac && (
                      <span
                        className="absolute start-4 top-4 rounded-full px-3 py-1 text-[11px] font-bold"
                        style={{
                          background: "var(--kt-teal)",
                          color: "var(--kt-deep)",
                          fontFamily: "var(--font-display)",
                        }}
                      >
                        {c.catBac}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 p-6">
                    <motion.p
                      layoutId={`cat-desig-${i}-${uid}`}
                      className="text-[11px] font-bold uppercase tracking-[0.12em]"
                      style={{
                        color: "var(--accent)",
                        fontFamily: "var(--font-display)",
                      }}
                    >
                      {course.designation}
                    </motion.p>
                    <motion.h3
                      layoutId={`cat-title-${i}-${uid}`}
                      className="text-xl font-bold"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {course.name}
                    </motion.h3>
                    <CardItem
                      translateZ={30}
                      className="mt-1 w-full text-sm"
                      style={{ color: "var(--muted)" }}
                    >
                      <span dir="ltr">{course.duration}</span> · {course.level}
                    </CardItem>
                    <CardItem
                      translateZ={20}
                      className="mt-3 flex w-full flex-wrap items-center gap-4"
                    >
                      <a
                        href={WA}
                        className="btn btn-primary self-start"
                        draggable={false}
                      >
                        {course.cta}
                      </a>
                      <a
                        href={`#/courses/${course.slug}`}
                        className="text-sm font-bold"
                        style={{ color: "var(--accent)" }}
                      >
                        {c.details}
                      </a>
                    </CardItem>
                  </div>
                    </CardBody>
                  </CardContainer>
                </motion.article>
              );
            })}
          </div>
          {pages > 1 && (
            <nav className="mt-8 flex items-center justify-center gap-2" aria-label="pages">
              {Array.from({ length: pages }, (_, p) => p + 1).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => goPage(p)}
                  aria-current={p === safePage ? "page" : undefined}
                  aria-label={`Page ${p}`}
                  className="grid h-11 w-11 place-items-center rounded-full text-sm font-bold transition-all"
                  dir="ltr"
                  style={
                    p === safePage
                      ? { background: "var(--accent)", color: "#fff", fontFamily: "var(--font-display)", fontVariantNumeric: "tabular-nums" }
                      : { background: "var(--surface)", color: "var(--muted)", fontFamily: "var(--font-display)", fontVariantNumeric: "tabular-nums" }
                  }
                >
                  {p}
                </button>
              ))}
            </nav>
          )}
          </>
        )}
      </div>

      {/* expanded card */}
      <AnimatePresence>
        {active !== null && activeCourse && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] h-full w-full bg-black/25 backdrop-blur-[6px]"
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {active !== null && activeCourse ? (
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
              layoutId={`cat-card-${active}-${uid}`}
              ref={modalRef}
              className="flex max-h-[90dvh] w-full max-w-[500px] flex-col overflow-hidden rounded-3xl bg-white"
            >
              <motion.img
                layoutId={`cat-img-${active}-${uid}`}
                src={activeCourse.photoCard}
                alt={activeCourse.name}
                width={500}
                height={500}
                className="h-80 w-full shrink-0 object-cover object-top sm:h-96"
              />
              <div className="overflow-y-auto p-6">
                <motion.p
                  layoutId={`cat-desig-${active}-${uid}`}
                  className="text-[11px] font-bold uppercase tracking-[0.12em]"
                  style={{
                    color: "var(--accent)",
                    fontFamily: "var(--font-display)",
                  }}
                >
                  {activeCourse.designation}
                </motion.p>
                <motion.h3
                  layoutId={`cat-title-${active}-${uid}`}
                  className="mt-1 text-2xl font-bold"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {activeCourse.name}
                </motion.h3>
                <p
                  className="mt-2 text-sm leading-relaxed"
                  style={{ color: "var(--muted)" }}
                >
                  {activeCourse.quote}
                </p>
                <a href={WA} className="btn btn-primary mt-5 w-full">
                  {activeCourse.cta}
                </a>
                <a
                  href={`#/courses/${activeCourse.slug}`}
                  className="mt-3 block text-center text-sm font-bold"
                  style={{ color: "var(--accent)" }}
                >
                  {c.details}
                </a>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}
