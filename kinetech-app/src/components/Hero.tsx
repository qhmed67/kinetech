import { motion } from "motion/react";
import type { ReactNode } from "react";
import { WavyBackground } from "@/components/ui/wavy-background";
import { useLang } from "./lang";

const WA = "https://wa.me/201042031062";

const WAVE_COLORS = ["#927BB3", "#7F639E", "#6E4E9C", "#472885", "#3BBCD9"];

function HeroBackdrop({ children }: { children: ReactNode }) {
  const cls = "mx-auto w-full max-w-7xl px-4 py-10 md:py-20";
  if (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  ) {
    return <div className={cls}>{children}</div>;
  }
  return (
    <WavyBackground
      backgroundFill="white"
      colors={WAVE_COLORS}
      speed="slow"
      waveOpacity={0.35}
      className={cls}
    >
      {children}
    </WavyBackground>
  );
}

function HeroDemo() {
  const { lang, t } = useLang();
  const h = t.hero;
  const words1 = h.t1.split(" ");
  const words2 = h.t2.split(" ");
  const renderWord = (word: string, index: number, accent: boolean) => (
    <motion.span
      key={`${accent ? "b" : "a"}-${word}-${index}`}
      initial={{ opacity: 0, filter: "blur(4px)", y: 10 }}
      animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
      transition={{
        duration: 0.3,
        delay: index * 0.1,
        ease: "easeInOut",
      }}
      className={`me-2 inline-block ${accent ? "text-[#6E4E9C]" : ""}`}
    >
      {word}
    </motion.span>
  );
  return (
    <HeroBackdrop>
      <h1
        key={lang}
        className="relative z-10 mx-auto max-w-4xl whitespace-nowrap text-center text-2xl font-bold text-[#1A1A1A] md:text-4xl lg:text-6xl"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {words1.map((word, i) => renderWord(word, i, false))}
        {words2.map((word, i) => renderWord(word, words1.length + i, true))}
      </h1>
      <motion.p
        initial={{
          opacity: 0,
        }}
        animate={{
          opacity: 1,
        }}
        transition={{
          duration: 0.3,
          delay: 0.8,
        }}
          className="relative z-10 mx-auto max-w-xl pt-8 pb-4 text-center text-lg font-medium text-[#3D3250]"
      >
        {h.lead}
      </motion.p>
      <motion.div
        initial={{
          opacity: 0,
        }}
        animate={{
          opacity: 1,
        }}
        transition={{
          duration: 0.3,
          delay: 1,
        }}
        className="relative z-10 mt-8 flex flex-wrap items-center justify-center gap-4"
      >
        <a
          href={WA}
          data-od-id="hero-cta"
          className="w-60 transform rounded-lg px-6 py-2 text-center font-bold text-white transition-all duration-300 hover:-translate-y-0.5 hover:brightness-110"
          style={{ background: "var(--kt-gradient)", fontFamily: "var(--font-display)" }}
        >
          {h.cta1}
        </a>
        <a
          href="#pillars"
          data-od-id="hero-link"
          className="w-60 transform rounded-lg border border-gray-300 bg-white px-6 py-2 text-center font-medium text-black transition-all duration-300 hover:-translate-y-0.5 hover:bg-gray-100"
        >
          {h.cta2}
        </a>
      </motion.div>
    </HeroBackdrop>
  );
}

export function Hero() {
  return (
    <>
      <section
        className="relative overflow-hidden"
        data-od-id="hero"
        id="top"
        aria-labelledby="hero-h"
      >
        <div className="absolute inset-y-0 left-0 h-full w-px bg-neutral-200/80">
          <div className="absolute top-0 h-40 w-px bg-gradient-to-b from-transparent via-[#3BBCD9] to-transparent" />
        </div>
        <div className="absolute inset-y-0 right-0 h-full w-px bg-neutral-200/80">
          <div className="absolute h-40 w-px bg-gradient-to-b from-transparent via-[#3BBCD9] to-transparent" />
        </div>
        <div className="absolute inset-x-0 bottom-0 h-px w-full bg-neutral-200/80">
          <div className="absolute mx-auto h-px w-40 bg-gradient-to-r from-transparent via-[#3BBCD9] to-transparent" />
        </div>
        <span id="hero-h" className="sr-only">
          KineTech
        </span>
      <HeroDemo />
    </section>
    </>
  );
}
