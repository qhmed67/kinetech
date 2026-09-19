import { motion } from "motion/react";
import { useLang } from "./lang";

const WA = "https://wa.me/201042031062";

function ChatArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" fill="none" aria-hidden="true" className={className}>
      <rect x="10" y="18" width="100" height="64" rx="16" fill="currentColor" opacity="0.16" />
      <rect x="24" y="34" width="52" height="8" rx="4" fill="currentColor" />
      <rect x="24" y="48" width="72" height="7" rx="3.5" fill="currentColor" opacity="0.55" />
      <rect x="24" y="60" width="60" height="7" rx="3.5" fill="currentColor" opacity="0.55" />
      <path d="M34 82l-6 16 20-16z" fill="currentColor" opacity="0.16" />
      <circle cx="94" cy="34" r="10" fill="currentColor" opacity="0.35" />
    </svg>
  );
}

function ScopeArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" fill="none" aria-hidden="true" className={className}>
      <circle cx="60" cy="60" r="44" stroke="currentColor" strokeWidth="9" opacity="0.2" />
      <circle cx="60" cy="60" r="26" stroke="currentColor" strokeWidth="9" opacity="0.45" />
      <circle cx="60" cy="60" r="9" fill="currentColor" />
      <path d="M92 30l14-14M106 30l-14-14" stroke="currentColor" strokeWidth="7" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

function ShipArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" fill="none" aria-hidden="true" className={className}>
      <rect x="18" y="66" width="84" height="30" rx="15" fill="currentColor" opacity="0.16" />
      <path d="M60 92V30M60 30L36 54M60 30l24 24" stroke="currentColor" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="88" cy="30" r="9" fill="currentColor" opacity="0.5" />
    </svg>
  );
}

function CapArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" fill="none" aria-hidden="true" className={className}>
      <path d="M60 26L12 46l48 20 38-16v24h10V46L60 26z" fill="currentColor" opacity="0.75" />
      <path d="M32 60v16c0 8 12 16 28 16s28-8 28-16V60l-28 12-28-12z" fill="currentColor" opacity="0.3" />
      <circle cx="60" cy="100" r="6" fill="currentColor" />
    </svg>
  );
}

function SendArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" fill="none" aria-hidden="true" className={className}>
      <g
        transform="translate(30,30) scale(2.5)"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      >
        <path d="m22 2-7 20-4-9-9-4Z" />
        <path d="M22 2 11 13" />
      </g>
    </svg>
  );
}

export function Pillars() {
  const { t } = useLang();
  const f = t.flow;
  const cards = [
    {
      n: "1",
      title: f.steps[0].title,
      desc: f.steps[0].desc,
      bg: "#6E4E9C",
      fg: "#FFFFFF",
      sub: "rgba(255,255,255,.75)",
      span: "md:col-span-3",
      Art: ChatArt,
    },
    {
      n: "2",
      title: f.steps[1].title,
      desc: f.steps[1].desc,
      bg: "#D6E9F8",
      fg: "#1A1A1A",
      sub: "rgba(26,26,26,.68)",
      span: "md:col-span-4",
      Art: ScopeArt,
    },
    {
      n: "3",
      title: f.steps[2].title,
      desc: f.steps[2].desc,
      bg: "#D3EDC3",
      fg: "#1A1A1A",
      sub: "rgba(26,26,26,.68)",
      span: "md:col-span-5",
      Art: ShipArt,
    },
    {
      n: "4",
      title: f.steps[3].title,
      desc: f.steps[3].desc,
      bg: "#3BBCD9",
      fg: "#0E2A33",
      sub: "rgba(14,42,51,.72)",
      span: "md:col-span-7",
      Art: CapArt,
    },
  ];
  return (
    <section
      className="py-20 md:py-28"
      data-od-id="pillars"
      id="pillars"
      aria-labelledby="pillars-h"
      style={{ background: "#fff" }}
    >
      <div className="kt-wrap">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <p
            className="text-xs font-bold uppercase tracking-[0.14em]"
            style={{ color: "var(--accent)", fontFamily: "var(--font-display)" }}
          >
            {f.eyebrow}
          </p>
          <h2
            id="pillars-h"
            className="mt-3 max-w-[16ch] text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl"
            style={{ fontFamily: "var(--font-display)", color: "var(--fg)" }}
          >
            {f.h2}
          </h2>
        </motion.div>

        <div className="mt-10 grid gap-5 md:grid-cols-12">
          {cards.map((c, i) => (
            <motion.article
              key={c.n}
              initial={{ opacity: 0, y: 26 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.08, ease: "easeOut" }}
              className={`relative flex min-h-[280px] flex-col justify-between overflow-hidden rounded-[22px] p-7 transition-transform duration-200 hover:-translate-y-1 ${c.span} md:p-8`}
              style={{ background: c.bg, color: c.fg }}
            >
              <div className="flex items-start justify-between gap-4">
                <span
                  aria-hidden="true"
                  className="text-5xl font-bold leading-none md:text-6xl"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {c.n}
                </span>
                <c.Art className="h-16 w-16 flex-none md:h-20 md:w-20 lg:h-28 lg:w-28" />
              </div>
              <div className="mt-8">
                <h3
                  className="text-xl font-bold md:text-2xl"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {c.title}
                </h3>
                <p
                  className="mt-2 max-w-[38ch] text-[14.5px] leading-relaxed"
                  style={{ color: c.sub }}
                >
                  {c.desc}
                </p>
              </div>
            </motion.article>
          ))}

          <motion.article
            initial={{ opacity: 0, y: 26 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: 0.32, ease: "easeOut" }}
            className="relative flex min-h-[260px] flex-col justify-between overflow-hidden rounded-[22px] p-7 transition-transform duration-200 hover:-translate-y-1 md:col-span-5 md:p-8"
            style={{ background: "var(--kt-deep)", color: "#fff" }}
          >
            <div className="flex items-start justify-between gap-4">
              <span
                aria-hidden="true"
                className="text-5xl font-bold leading-none md:text-6xl"
                style={{
                  fontFamily: "var(--font-display)",
                  color: "var(--kt-teal)",
                }}
              >
                5
              </span>
              <SendArt className="h-16 w-16 flex-none md:h-20 md:w-20 lg:h-28 lg:w-28" />
            </div>
            <div className="mt-8">
              <h3
                className="text-xl font-bold md:text-2xl"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {f.ctaTitle}
              </h3>
              <p className="mt-2 max-w-[38ch] text-[14.5px] leading-relaxed text-white/72">
                {f.ctaText}
              </p>
              <a
                href={WA}
                className="mt-5 inline-flex min-h-[48px] items-center rounded-full bg-white px-7 text-[15px] font-bold transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0"
                style={{
                  color: "var(--kt-deep)",
                  fontFamily: "var(--font-display)",
                }}
              >
                {f.ctaBtn}
              </a>
            </div>
          </motion.article>
        </div>
      </div>
    </section>
  );
}
