import { useLang } from "./lang";

const WA = "https://wa.me/201042031062";
const FB = "https://www.facebook.com/profile.php?id=61588373937044";

export function Footer() {
  const { t } = useLang();
  const f = t.footer;
  const linkCls = "transition-colors hover:text-[var(--accent)]";
  return (
    <footer className="pagefoot" data-od-id="footer" style={{ background: "#fff", borderTop: "1px solid var(--kt-line)" }}>
      <div className="kt-wrap flex flex-col items-center gap-4 py-5 text-center text-sm" style={{ color: "var(--muted)" }}>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
        <a href="#/" aria-label="KineTech home" className="flex items-center gap-2">
          <img
            className="logo-img"
            src="assets/logo.png"
            width="30"
            height="30"
            alt="KineTech logo"
            style={{ width: 30, height: 30 }}
          />
          <span className="wordmark" style={{ fontSize: 16 }}>
            <span className="k">KINE</span>
            <span className="t">TECH</span>
          </span>
        </a>
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-1" aria-label="quick">
          <a className={linkCls} href="#/courses">{t.nav.courses}</a>
          <a className={linkCls} href="#/baccalaureate" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>{t.nav.baccalaureate}</a>
          <a className={linkCls} href="#/about">{t.misc.aboutH}</a>
          <a className={linkCls} href="#/contact">{t.contactPage.h2}</a>
        </nav>
        <a href="tel:+201042031062" data-od-id="foot-phone" dir="ltr" className={linkCls} style={{ fontFamily: "var(--font-display)", fontVariantNumeric: "tabular-nums" }}>
          {f.phone}
        </a>
        <span className="flex items-center gap-2">
          <a
            href={FB}
            aria-label="Facebook"
            className="grid h-8 w-8 place-items-center rounded-full border transition-all hover:-translate-y-0.5"
            style={{ borderColor: "var(--border)", color: "var(--accent)" }}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-4 w-4">
              <path d="M13.5 21v-7h2.4l.4-3h-2.8V9.1c0-.9.3-1.5 1.6-1.5h1.3V4.9c-.3 0-1.1-.1-2-.1-2 0-3.4 1.2-3.4 3.5V11H8.5v3H11v7z" />
            </svg>
          </a>
          <a
            href={WA}
            aria-label="WhatsApp"
            className="grid h-8 w-8 place-items-center rounded-full border transition-all hover:-translate-y-0.5"
            style={{ borderColor: "var(--border)", color: "var(--accent)" }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true" className="h-4 w-4">
              <path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
            </svg>
          </a>
          <span
            title="YouTube — soon"
            aria-label="YouTube — soon"
            className="grid h-8 w-8 place-items-center rounded-full border opacity-45"
            style={{ borderColor: "var(--border)", color: "var(--accent)" }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true" className="h-4 w-4">
              <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
              <path d="m10 15 5-3-5-3z" />
            </svg>
          </span>
          <span
            title="Instagram — soon"
            aria-label="Instagram — soon"
            className="grid h-8 w-8 place-items-center rounded-full border opacity-45"
            style={{ borderColor: "var(--border)", color: "var(--accent)" }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true" className="h-4 w-4">
              <rect width="18" height="18" x="3" y="3" rx="5" />
              <circle cx="12" cy="12" r="3.5" />
              <circle cx="17" cy="7" r="0.5" fill="currentColor" />
            </svg>
          </span>
        </span>
        </div>
        <span className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t pt-4 text-[13px]" style={{ borderColor: "var(--kt-line)" }}>
          <span style={{ fontFamily: "var(--font-body)" }}>{f.rights}</span>
          <a href="#/privacy" className={linkCls}>{t.legal.privacyT}</a>
          <a href="#/terms" className={linkCls}>{t.legal.termsT}</a>
        </span>
      </div>
    </footer>
  );
}
