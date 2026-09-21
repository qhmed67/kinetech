import { useState } from "react";
import { motion } from "motion/react";
import { BrandLines } from "@/components/ui/background-lines-brand";
import { useLang } from "../components/lang";

const WA = "https://wa.me/201042031062";

export function Baccalaureate() {
  const { t } = useLang();
  const b = t.bac;
  const [open, setOpen] = useState<number | null>(0);
  return (
    <main id="content">
      {/* hero */}
      <section className="relative overflow-hidden" style={{ background: "var(--kt-deep)" }}>
        <BrandLines className="absolute inset-0" svgOptions={{ duration: 14 }}><span /></BrandLines>
        <div className="kt-wrap relative py-16 md:py-24" style={{ maxWidth: 860 }}>
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
          >
            <p
              className="inline-flex items-center rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-[0.1em]"
              style={{
                background: "var(--kt-teal)",
                color: "var(--kt-deep)",
                fontFamily: "var(--font-display)",
              }}
            >
              {b.eyebrow}
            </p>
            <h1
              className="mt-8 text-4xl font-bold leading-[1.35] tracking-tight text-white md:text-6xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {b.heroT}
            </h1>
            <p className="mt-6 max-w-[56ch] text-lg leading-relaxed text-white/80">
              {b.heroD}
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <a
                href={WA}
                className="btn group relative overflow-hidden font-bold transition-all duration-300 hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_16px_32px_-12px_rgba(37,211,102,0.65)] active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:transform-none"
                style={{
                  background: "#25D366",
                  color: "#fff",
                  fontFamily: "var(--font-display)",
                }}
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full motion-reduce:hidden rtl:translate-x-full rtl:group-hover:-translate-x-full"
                />
                <span aria-hidden="true" className="absolute -inset-1 -z-10 animate-ping rounded-full bg-[#25D366]/30 motion-reduce:hidden" />
                <span className="relative">{b.bookNow}</span>
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* intro + source */}
      <section className="section">
        <div className="kt-wrap" style={{ maxWidth: 860 }}>
          <h2 style={{ fontSize: "var(--fs-h2)" }}>{b.h2}</h2>
          <p
            className="mt-4 inline-block rounded-full px-4 py-1.5 text-xs font-bold"
            style={{
              background: "var(--teal-soft)",
              color: "var(--kt-deep)",
              fontFamily: "var(--font-display)",
            }}
          >
            {b.srcT}
          </p>
          <p className="lead mt-3">{b.srcD}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a
              href="https://egyptianbaccalaureate.blob.core.windows.net/egyptianbaccalaureate/Programming-ArtificialIntelligence-Ar-EB-part1.pdf"
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary"
            >
              {b.srcP1}
            </a>
            <a
              href="https://egyptianbaccalaureate.blob.core.windows.net/egyptianbaccalaureate/Programming-ArtificialIntelligence-Ar-EB-part2.pdf"
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary"
            >
              {b.srcP2}
            </a>
          </div>

          <h3
            className="mt-12 text-2xl font-bold md:text-3xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {b.unitsT}
          </h3>
          <div className="mt-6 grid gap-6">
            {b.terms.map((term) => (
              <div
                key={term.t}
                className="overflow-hidden rounded-[22px] border bg-white"
                style={{ borderColor: "var(--kt-line)" }}
              >
                <p
                  className="px-6 py-4 font-bold text-white"
                  style={{
                    background: "var(--kt-deep)",
                    fontFamily: "var(--font-display)",
                  }}
                >
                  {term.t}
                </p>
                <div className="grid gap-px md:grid-cols-2" style={{ background: "var(--kt-line)" }}>
                  {term.chapters.map((ch, ci) => (
                    <div
                      key={ch.n}
                      className={`bg-white p-5 ${ci === term.chapters.length - 1 && term.chapters.length % 2 === 1 ? "md:col-span-2" : ""}`}
                    >
                      <p
                        className="font-bold"
                        style={{ fontFamily: "var(--font-display)" }}
                      >
                        {ch.n}
                      </p>
                      <ul className="mt-2 grid gap-1.5 text-sm" style={{ color: "var(--muted)" }}>
                        {ch.lessons.map((l) => (
                          <li key={l}>— {l}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* old vs new */}
      <section className="section" style={{ background: "var(--surface)", borderTop: "1px solid var(--kt-line)", borderBottom: "1px solid var(--kt-line)" }}>
        <div className="kt-wrap" style={{ maxWidth: 860 }}>
          <h2 style={{ fontSize: "var(--fs-h2)" }}>{b.compareT}</h2>
          <div className="mt-8 grid gap-4">
            <div className="grid grid-cols-2 gap-4 text-sm font-bold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
              <p>{b.oldT}</p>
              <p>{b.newT}</p>
            </div>
            {b.compare.map((row, i) => (
              <motion.div
                key={row.neu}
                initial={{ opacity: 0, x: 24 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.4, delay: i * 0.08, ease: "easeOut" }}
                className="grid grid-cols-2 gap-4"
              >
                <div className="rounded-2xl border bg-white p-5" style={{ borderColor: "var(--kt-line)", opacity: 0.75 }}>
                  <p className="font-bold">{row.old}</p>
                </div>
                <div className="rounded-2xl p-5 text-white" style={{ background: "var(--kt-deep)" }}>
                  <p className="font-bold">{row.neu}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* mapping + FAQ */}
      <section className="section">
        <div className="kt-wrap" style={{ maxWidth: 860 }}>
          <h2 style={{ fontSize: "var(--fs-h2)" }}>{b.mapT}</h2>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {b.rows.map((r) => (
              <div
                key={r.need}
                className="flex items-center justify-between gap-4 rounded-2xl border bg-white px-5 py-4"
                style={{ borderColor: "var(--kt-line)" }}
              >
                <span className="font-bold">{r.need}</span>
                <span
                  className="rounded-full px-3.5 py-1.5 text-xs font-bold"
                  style={{
                    background: "var(--kt-teal)",
                    color: "var(--kt-deep)",
                    fontFamily: "var(--font-display)",
                  }}
                >
                  {b.courseEx}
                </span>
              </div>
            ))}
          </div>

          <h2 className="mt-14" style={{ fontSize: "var(--fs-h2)" }}>{b.faqT}</h2>
          <div className="mt-6 grid gap-3">
            {b.faq.map((f, i) => {
              const isOpen = open === i;
              return (
                <div
                  key={f.q}
                  className="overflow-hidden rounded-2xl border bg-white"
                  style={{ borderColor: "var(--kt-line)" }}
                >
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-start font-bold"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {f.q}
                    <span
                      aria-hidden="true"
                      className="grid h-8 w-8 flex-none place-items-center rounded-full text-lg"
                      style={{
                        background: isOpen ? "var(--accent)" : "var(--surface)",
                        color: isOpen ? "#fff" : "var(--fg)",
                      }}
                    >
                      {isOpen ? "−" : "+"}
                    </span>
                  </button>
                  {isOpen && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="overflow-hidden px-5 text-[15px] leading-relaxed"
                      style={{ color: "var(--muted)" }}
                    >
                      <span className="block pb-5">{f.a}</span>
                    </motion.p>
                  )}
                </div>
              );
            })}
          </div>

          <div
            className="mt-12 rounded-[24px] p-8 text-center text-white md:p-10"
            style={{ background: "var(--kt-dark-gradient)" }}
          >
            <h2
              className="text-2xl font-bold md:text-3xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {b.cta}
            </h2>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <a
                href={WA}
                className="btn relative font-bold"
                style={{
                  background: "#25D366",
                  color: "#fff",
                  fontFamily: "var(--font-display)",
                }}
              >
                <span aria-hidden="true" className="absolute -inset-1 -z-10 animate-ping rounded-full bg-[#25D366]/30 motion-reduce:hidden" />
                <span className="relative">{b.bookNow}</span>
              </a>
              <a href="#/courses" className="btn btn-outline-light">
                {t.catalog.h2}
              </a>
            </div>
            <p className="meta mx-auto mt-4" style={{ color: "rgba(255,255,255,.6)" }}>
              {b.note}
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
