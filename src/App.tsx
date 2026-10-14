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
import { Watch } from "./pages/Watch";
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
import { clearUser, getUser, signOutEverywhere, subscribeUserChanged, type KtUser } from "./auth";
import { parseHash, type Route } from "./router";
import { wireStoreSync } from "./store";
import { AdminLogin } from "./admin/AdminLogin";
import { AdminApp } from "./admin/AdminApp";

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
  // M1: protected pages wait for cloud bootstrap before deciding redirects —
  // otherwise a valid server session on a fresh cache bounces to sign-in.
  const [authReady, setAuthReady] = useState(false);

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

  // Home anchors (#/services …): scroll to the section after paint,
  // overriding the top-scroll above. Runs on first load too.
  useEffect(() => {
    if (route.name !== "home" || !route.anchor) return;
    const id = route.anchor;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const t1 = window.setTimeout(() => {
      window.requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      });
    }, 60);
    return () => window.clearTimeout(t1);
  }, [route]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "kt-user") setUser(getUser());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    // Supabase source of truth: catalog hydrate runs via store on first read;
    // here adopt server session/watch progress when configured.
    const unsub = subscribeUserChanged(() => setUser(getUser()));
    void import("./lib/db/sync")
      .then((m) => m.bootstrapFromCloud(() => setUser(getUser())))
      .catch(() => {
        /* offline — local session stays */
      })
      .finally(() => setAuthReady(true));
    // Session revalidation: a deleted/banned account is signed out HERE,
    // within a minute — no manual sign-out needed. Protected pages bounce
    // via their existing guards once the user state clears.
    const reval = window.setInterval(() => {
      void import("./lib/db/sync")
        .then((m) => m.syncMyGrants())
        .then((changed) => {
          if (changed) setUser(getUser());
        })
        .catch(() => {
          /* offline — keep current session */
        });
    }, 60000);
    return () => {
      unsub();
      window.clearInterval(reval);
    };
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
    // Full purge: local cache + Supabase session + id/role caches.
    // clearUser-only sign-outs leak the server session into the next account.
    void signOutEverywhere()
      .catch(() => {
        clearUser();
      })
      .finally(() => {
        setUser(getUser());
        window.location.hash = "#/";
      });
  }, []);

  const ctx = useMemo(
    () => ({ lang, t: STR[lang], toggle }),
    [lang, toggle],
  );

  useEffect(() => {
    wireStoreSync();
  }, []);

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

  const isAdminRoute = route.name === "adminLogin" || route.name === "admin";

  return (
    <LangContext.Provider value={ctx}>
      {isAdminRoute ? (
        <div className="langfade" style={{ opacity: fading ? 0 : 1 }} aria-busy={fading}>
          {route.name === "adminLogin" && <AdminLogin />}
          {route.name === "admin" && <AdminApp page={route.page} />}
        </div>
      ) : (
      <div
        className="langfade"
        style={{ opacity: fading ? 0 : 1 }}
        aria-busy={fading}
      >
        <TopNav user={user} onSignout={signout} />
        {route.name === "home" && <Landing />}
        {route.name === "courses" && <Courses />}
        {route.name === "course" && <CourseDetail slug={route.slug} />}
        {route.name === "watch" && (
          <Watch slug={route.slug} video={route.video} user={user} ready={authReady} />
        )}
        {route.name === "baccalaureate" && <Baccalaureate />}
        {route.name === "dashboard" && (
          <Dashboard user={user} onSignout={signout} tab={route.tab} ready={authReady} onUserChange={() => setUser(getUser())} />
        )}
        {route.name === "service" && <ServicePage slug={route.slug} />}
        {route.name === "about" && <About />}
        {route.name === "contact" && <ContactPage />}
        {route.name === "privacy" && <Privacy />}
        {route.name === "terms" && <Terms />}
        {route.name === "notfound" && <NotFound />}
        <Footer />
      </div>
      )}
    </LangContext.Provider>
  );
}
