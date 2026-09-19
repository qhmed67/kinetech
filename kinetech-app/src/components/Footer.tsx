import { useLang } from "./lang";

const FB = "https://www.facebook.com/profile.php?id=61588373937044";

export function Footer() {
  const { t } = useLang();
  const f = t.footer;
  return (
    <footer className="pagefoot" data-od-id="footer">
      <div className="kt-wrap row-between" style={{ flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <img
            className="logo-img"
            src="assets/logo.png"
            width="36"
            height="36"
            alt="KineTech logo"
            style={{ width: 36, height: 36 }}
          />
          <div>
            <span className="wordmark" style={{ fontSize: 16 }}>
              <span className="k">KINE</span>
              <span className="t">TECH</span>
            </span>
            <div style={{ fontSize: 12 }}>{f.tag}</div>
          </div>
        </div>
        <div style={{ display: "grid", gap: 2 }}>
          <a
            className="contact-row"
            href="tel:+201042031062"
            data-od-id="foot-phone"
          >
            <span className="badge-dot">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                aria-hidden="true"
              >
                <path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
              </svg>
            </span>
            <span
              dir="ltr"
              style={{
                fontFamily: "var(--font-display)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {f.phone}
            </span>
          </a>
          <a className="contact-row" href={FB} data-od-id="foot-fb">
            <span className="badge-dot">
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M13.5 21v-7h2.4l.4-3h-2.8V9.1c0-.9.3-1.5 1.6-1.5h1.3V4.9c-.3 0-1.1-.1-2-.1-2 0-3.4 1.2-3.4 3.5V11H8.5v3H11v7z" />
              </svg>
            </span>
            {f.fb}
          </a>
        </div>
        <span
          style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--muted)" }}
        >
          {f.rights}
        </span>
      </div>
    </footer>
  );
}
