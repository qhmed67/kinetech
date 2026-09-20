import { useCallback, useEffect, useMemo, useState } from "react";
import { TopNav } from "./components/TopNav";
import { Hero } from "./components/Hero";
import { Pillars } from "./components/Pillars";
import { Services } from "./components/Services";
import { Academy } from "./components/Academy";
import { Reviews } from "./components/Reviews";
import { Contact } from "./components/Contact";
import { Footer } from "./components/Footer";
import { Courses } from "./pages/Courses";
import { CourseDetail } from "./pages/CourseDetail";
import { Dashboard } from "./pages/Dashboard";
import { Baccalaureate } from "./pages/Baccalaureate";
import { ServicePage } from "./pages/ServicePage";
import { About } from "./pages/About";
import { ContactPage } from "./pages/ContactPage";
import { Privacy } from "./pages/Legal";
import { Terms } from "./pages/Legal";
import { NotFound } from "./pages/NotFound";
import { LangContext } from "./components/lang";
import { STR, getInitialLang, type Lang } from "./i18n";
import { clearUser, getUser, type KtUser } from "./auth";
import { parseHash, type Route } from "./router";

function syncDoc(lang: Lang) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  try {
    window.localStorage.setItem("kt-lang", lang);
  } catch {
    /* ignore */
  }
}

function Landing() {
  return (
    <main id="content">
      <Hero />
      <Pillars />
      <Services />
      <Academy />
      <Reviews />
      <Contact />
    </main>
  );
}

export default function App() {
  const [lang, setLang] = useState<Lang>(getInitialLang);
  const [fading, setFading] = useState(false);
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  const [user, setUser] = useState<KtUser | null>(() => getUser());

  useEffect(() => {
    syncDoc(lang);
  }, [lang]);

  useEffect(() => {
    const onHash = () => {
      setRoute(parseHash(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "kt-user") setUser(getUser());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

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

  const signout = useCallback(() => {
    clearUser();
    setUser(null);
    window.location.hash = "#/";
  }, []);

  const ctx = useMemo(
    () => ({ lang, t: STR[lang], toggle }),
    [lang, toggle],
  );

  useEffect(() => {
    if (route.name !== "home") return;
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
  }, [lang, route.name]);

  return (
    <LangContext.Provider value={ctx}>
      <div
        className="langfade"
        style={{ opacity: fading ? 0 : 1 }}
        aria-busy={fading}
      >
        <TopNav user={user} onSignout={signout} />
        {route.name === "home" && <Landing />}
        {route.name === "courses" && <Courses />}
        {route.name === "course" && <CourseDetail slug={route.slug} />}
        {route.name === "baccalaureate" && <Baccalaureate />}
        {route.name === "dashboard" && (
          <Dashboard user={user} onSignout={signout} tab={route.tab} />
        )}
        {route.name === "service" && <ServicePage slug={route.slug} />}
        {route.name === "about" && <About />}
        {route.name === "contact" && <ContactPage />}
        {route.name === "privacy" && <Privacy />}
        {route.name === "terms" && <Terms />}
        {route.name === "notfound" && <NotFound />}
        <Footer />
      </div>
    </LangContext.Provider>
  );
}
