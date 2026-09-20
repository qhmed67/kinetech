import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Seek } from "@/components/ui/seek-search";
import { initialsOf, type KtUser } from "../auth";
import { useLang } from "./lang";

function sectionFor(query: string): string | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  if (/robot|solidworks|cswa|python|data|programm|تدريب|كورس|داتا|بايثون|برمج|سوليد|روبوت/.test(q))
    return "academy";
  if (/market|design|software|service|تسويق|تصميم|خدمة|برمجيات/.test(q))
    return "services";
  if (/review|آراء|تقييم|عميل/.test(q)) return "team";
  if (/contact|whatsapp|تواصل|واتساب|اتصل/.test(q)) return "contact";
  if (/pillar|ركائز|craft/.test(q)) return "pillars";
  return null;
}

export function TopNav({
  user,
  onSignout,
}: {
  user: KtUser | null;
  onSignout: () => void;
}) {
  const { lang, t, toggle } = useLang();
  const [menu, setMenu] = useState(false);
  const [bell, setBell] = useState(false);
  const [unread, setUnread] = useState(3);
  const [drawer, setDrawer] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!drawer) {
      setShown(false);
      return;
    }
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => setShown(true)),
    );
    return () => cancelAnimationFrame(id);
  }, [drawer ]);

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawer(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [drawer]);
  const onSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const v = e.currentTarget.querySelector("input")?.value ?? "";
    const id = sectionFor(v);
    if (!id) return;
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
      return;
    }
    window.location.hash = "#/";
    window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    }, 450);
  };
  const goSignin = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
      return;
    e.preventDefault();
    const root = document.querySelector(".langfade") as HTMLElement | null;
    try {
      window.sessionStorage.setItem("auth-anim", "1");
    } catch {
      /* ignore */
    }
    if (root) root.style.opacity = "0";
    window.setTimeout(() => {
      window.location.href = "signin.html";
    }, 220);
  };
  return (
    <header className="topnav" data-od-id="topnav">
      <div className="kt-wrap topnav-inner">
        <a
          className="brandlock"
          href="#/"
          aria-label="KineTech home"
          data-od-id="nav-brand"
        >
          <img
            className="logo-img"
            src="assets/logo.png"
            width="48"
            height="48"
            alt="KineTech split-circle logo"
            style={{ width: 48, height: 48 }}
          />
          <span className="wordmark">
            <span className="k">KINE</span>
            <span className="t">TECH</span>
          </span>
        </a>
        <div className="row" style={{ gap: 10 }}>
          <form
            onSubmit={onSearch}
            role="search"
            dir={lang === "ar" ? "rtl" : "ltr"}
            className="hidden md:block"
            aria-label={lang === "ar" ? "بحث" : "Search"}
          >
            <Seek
              corner={32}
              give={50}
              spring={50}
              width={320}
              placeholder={lang === "ar" ? "ابحث" : "Search"}
              dir={lang === "ar" ? "rtl" : "ltr"}
              ariaLabel={lang === "ar" ? "بحث" : "Search"}
            />
          </form>
          <a href="#/courses" className="nav-bare hidden md:inline-flex">
            {t.nav.courses}
          </a>
          <a href="#/baccalaureate" className="nav-bare hidden md:inline-flex">
            {t.nav.baccalaureate}
          </a>
          <button
            className="btn btn-secondary lang-toggle"
            type="button"
            onClick={toggle}
            aria-label="Switch language"
          >
            {t.toggle}
          </button>
          {user ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setBell((v) => !v);
                  setMenu(false);
                  setUnread(0);
                }}
                aria-label={t.dashboard.notifT}
                className="relative hidden h-11 w-11 place-items-center rounded-full sm:grid"
                style={{
                  border: "1px solid var(--border)",
                  background: "var(--accent-soft)",
                  color: "var(--accent)",
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true" className={`h-5 w-5 ${unread > 0 ? "bell-ring" : ""}`}>
                  <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
                  <path d="M10 20a2 2 0 0 0 4 0" />
                </svg>
                {unread > 0 && (
                  <span
                    className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-bold text-white"
                    style={{ background: "#B3261E" }}
                  >
                    {unread}
                  </span>
                )}
              </button>
              <AnimatePresence>
              {bell && (
                <motion.div
                  role="menu"
                  initial={{ opacity: 0, scale: 0.9, y: -8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.94, y: -4 }}
                  transition={{ type: "spring", stiffness: 480, damping: 28 }}
                  className="absolute end-0 top-13 z-30 w-72 overflow-hidden rounded-2xl border bg-white shadow-xl ltr:origin-top-right rtl:origin-top-left"
                  style={{ borderColor: "var(--kt-line)" }}
                >
                  {t.dashboard.notes.map((n: string) => (
                    <p
                      key={n}
                      className="flex items-start gap-2.5 border-b px-4 py-3 text-[13px] leading-snug last:border-0 hover:bg-neutral-50"
                      style={{ borderColor: "var(--kt-line)" }}
                    >
                      <span
                        aria-hidden="true"
                        className="mt-1.5 h-2 w-2 flex-none rounded-full"
                        style={{ background: "var(--kt-teal)" }}
                      />
                      {n}
                    </p>
                  ))}
                </motion.div>
              )}
              </AnimatePresence>
            </div>
          ) : null}
          {user ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => { setMenu((v) => !v); setBell(false); }}
                onBlur={(e) => {
                  if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node))
                    setMenu(false);
                }}
                aria-haspopup="menu"
                aria-expanded={menu}
                aria-label={user.name}
                className="grid h-11 w-11 place-items-center rounded-full font-bold text-white"
                style={{
                  background: "var(--accent)",
                  fontFamily: "var(--font-display)",
                }}
              >
                {initialsOf(user.name)}
              </button>
              <AnimatePresence>
              {menu && (
                <motion.div
                  role="menu"
                  initial={{ opacity: 0, scale: 0.9, y: -8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.94, y: -4 }}
                  transition={{ type: "spring", stiffness: 480, damping: 28 }}
                  className="absolute end-0 top-13 z-30 w-48 overflow-hidden rounded-2xl border bg-white shadow-xl ltr:origin-top-right rtl:origin-top-left"
                  style={{ borderColor: "var(--kt-line)" }}
                >
                  <a
                    href="#/dashboard"
                    role="menuitem"
                    onClick={() => setMenu(false)}
                    className="block px-4 py-3 text-sm font-bold hover:bg-neutral-50"
                  >
                    {t.nav.myDashboard}
                  </a>
                  <a
                    href="#/dashboard/courses"
                    role="menuitem"
                    onClick={() => setMenu(false)}
                    className="block px-4 py-3 text-sm font-bold hover:bg-neutral-50"
                  >
                    {t.nav.dashboard}
                  </a>
                  <a
                    href="#/dashboard/settings"
                    role="menuitem"
                    onClick={() => setMenu(false)}
                    className="block px-4 py-3 text-sm font-bold hover:bg-neutral-50"
                  >
                    {t.nav.settings}
                  </a>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenu(false);
                      onSignout();
                    }}
                    className="block w-full px-4 py-3 text-start text-sm font-bold hover:bg-neutral-50"
                    style={{ color: "#B3261E" }}
                  >
                    {t.nav.signout}
                  </button>
                </motion.div>
              )}
              </AnimatePresence>
            </div>
          ) : (
            <a href="signin.html" onClick={goSignin} data-od-id="nav-cta" className="nav-signin hidden sm:inline-flex">
              {t.nav.signin}
            </a>
          )}
          <button
            type="button"
            onClick={() => setDrawer(true)}
            aria-label={t.menu}
            aria-expanded={drawer}
            className="grid h-11 w-11 place-items-center rounded-full md:hidden"
            style={{ border: "1px solid var(--border)", color: "var(--fg)" }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="h-5 w-5">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        </div>
      </div>
      {/* mobile drawer — portaled to body: the sticky header's
          backdrop-filter would otherwise re-anchor `fixed` to itself */}
      {drawer &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-40 bg-black/30 transition-opacity duration-200 md:hidden"
              style={{ opacity: shown ? 1 : 0 }}
              onClick={() => setDrawer(false)}
            />
            <div
              key="drawer-panel"
              role="dialog"
              aria-modal="true"
              aria-label={t.menu}
              className="fixed inset-y-0 end-0 z-50 flex w-[86vw] max-w-[320px] flex-col gap-2 overflow-y-auto bg-white p-5 transition-transform duration-300 ease-out md:hidden"
              style={{
                borderInlineStart: "1px solid var(--kt-line)",
                transform: shown
                  ? "translateX(0)"
                  : lang === "ar"
                    ? "translateX(-100%)"
                    : "translateX(100%)",
              }}
            >
              <div className="flex items-center justify-between">
                <span className="wordmark" style={{ fontSize: 17 }}>
                  <span className="k">KINE</span>
                  <span className="t">TECH</span>
                </span>
                <button
                  type="button"
                  onClick={() => setDrawer(false)}
                  aria-label={lang === "ar" ? "إغلاق" : "Close"}
                  className="grid h-11 w-11 place-items-center rounded-full"
                  style={{ border: "1px solid var(--border)" }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="h-5 w-5">
                    <path d="M18 6l-12 12M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <form onSubmit={(e) => { onSearch(e); setDrawer(false); }} role="search" dir={lang === "ar" ? "rtl" : "ltr"} aria-label={lang === "ar" ? "بحث" : "Search"}>
                <Seek
                  corner={32}
                  give={0}
                  spring={50}
                  width={240}
                  placeholder={lang === "ar" ? "ابحث" : "Search"}
                  dir={lang === "ar" ? "rtl" : "ltr"}
                  ariaLabel={lang === "ar" ? "بحث" : "Search"}
                />
              </form>
              {[
                { href: "#/courses", label: t.nav.courses },
                { href: "#/baccalaureate", label: t.nav.baccalaureate },
                { href: "#/about", label: t.misc.aboutH },
                { href: "#/contact", label: t.contactPage.h2 },
              ].map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setDrawer(false)}
                  className="rounded-xl px-4 py-3 text-[15px] font-bold"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {l.label}
                </a>
              ))}
              <span className="my-1 border-t" style={{ borderColor: "var(--kt-line)" }} />
              {user ? (
                <>
                  <a href="#/dashboard" onClick={() => setDrawer(false)} className="rounded-xl px-4 py-3 text-[15px] font-bold" style={{ fontFamily: "var(--font-display)" }}>
                    {t.nav.myDashboard}
                  </a>
                  <button
                    type="button"
                    onClick={() => { setDrawer(false); onSignout(); }}
                    className="rounded-xl px-4 py-3 text-start text-[15px] font-bold"
                    style={{ color: "#B3261E" }}
                  >
                    {t.nav.signout}
                  </button>
                </>
              ) : (
                <a href="signin.html" onClick={goSignin} className="btn btn-primary mt-1 w-full">
                  {t.nav.signin}
                </a>
              )}
            </div>
          </>,
          document.body,
        )}
    </header>
  );
}
