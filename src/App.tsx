import { useCallback, useEffect, useMemo, useState } from "react";
import { TopNav } from "./components/TopNav";
import { Hero } from "./components/Hero";
import { Pillars } from "./components/Pillars";
import { Services } from "./components/Services";
import { Academy } from "./components/Academy";
import { Reviews } from "./components/Reviews";
import { Contact } from "./components/Contact";
import { Footer } from "./components/Footer";
import { LangContext } from "./components/lang";
import { STR, getInitialLang, type Lang } from "./i18n";

function syncDoc(lang: Lang) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  try {
    window.localStorage.setItem("kt-lang", lang);
  } catch {
    /* ignore */
  }
}

export default function App() {
  const [lang, setLang] = useState<Lang>(getInitialLang);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    syncDoc(lang);
  }, [lang]);

  const toggle = useCallback(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setLang((l) => (l === "en" ? "ar" : "en"));
      return;
    }
    setFading(true);
    window.setTimeout(() => {
      setLang((l) => (l === "en" ? "ar" : "en"));
      window.scrollTo(0, 0);
      setFading(false);
    }, 220);
  }, []);

  const ctx = useMemo(
    () => ({ lang, t: STR[lang], toggle }),
    [lang, toggle],
  );

  useEffect(() => {
    if (!("IntersectionObserver" in window)) {
      document
        .querySelectorAll(".reveal")
        .forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [lang]);

  return (
    <LangContext.Provider value={ctx}>
      <div
        className="langfade"
        style={{ opacity: fading ? 0 : 1 }}
        aria-busy={fading}
      >
        <TopNav />
        <main id="content">
          <Hero />
          <Pillars />
          <Services />
          <Academy />
          <Reviews />
          <Contact />
        </main>
        <Footer />
      </div>
    </LangContext.Provider>
  );
}
