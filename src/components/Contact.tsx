import { useLang } from "./lang";

const WA = "https://wa.me/201042031062";
const FB = "https://www.facebook.com/profile.php?id=61588373937044";

export function Contact() {
  const { t } = useLang();
  const c = t.contact;
  return (
    <section
      className="section"
      data-od-id="final-cta"
      id="contact"
      aria-labelledby="cta-h"
    >
      <div className="kt-wrap">
        <div className="cta-dark reveal">
          <img
            className="logo-cta"
            src="assets/logo.png"
            width="72"
            height="72"
            alt="KineTech logo"
          />
          <h2 id="cta-h" style={{ marginTop: 16 }}>
            {c.h2}
          </h2>
          <p>{c.p}</p>
          <div
            style={{
              display: "flex",
              gap: 12,
              justifyContent: "center",
              flexWrap: "wrap",
              marginTop: 28,
              position: "relative",
              zIndex: 1,
            }}
          >
            <a className="btn btn-light" href={WA} data-od-id="cta-whatsapp">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                aria-hidden="true"
              >
                <path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
              </svg>
              {c.wa}
            </a>
            <a
              className="btn btn-outline-light"
              href={FB}
              data-od-id="cta-facebook"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M13.5 21v-7h2.4l.4-3h-2.8V9.1c0-.9.3-1.5 1.6-1.5h1.3V4.9c-.3 0-1.1-.1-2-.1-2 0-3.4 1.2-3.4 3.5V11H8.5v3H11v7z" />
              </svg>
              {c.fb}
            </a>
          </div>
          <p
            className="meta num"
            style={{
              marginTop: 18,
              color: "color-mix(in oklch, var(--bg) 72%, transparent)",
              position: "relative",
              zIndex: 1,
            }}
          >
            <span dir="ltr">{c.metaNum}</span> · {c.metaFb}
          </p>
        </div>
      </div>
    </section>
  );
}
