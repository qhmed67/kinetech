import { useState } from "react";
import { useLang } from "../components/lang";

const WA = "https://wa.me/201042031062";

export function ContactPage() {
  const { t } = useLang();
  const c = t.contactPage;
  const [sent, setSent] = useState(false);
  return (
    <main id="content" className="section">
      <div className="kt-wrap" style={{ maxWidth: 720 }}>
        <p className="eyebrow">{c.eyebrow}</p>
        <h1 style={{ fontSize: "var(--fs-h2)" }}>{c.h2}</h1>
        <p className="lead mt-3">{c.sub}</p>
        <form
          className="mt-8 grid gap-4 rounded-[24px] border bg-white p-6 md:p-8"
          style={{ borderColor: "var(--kt-line)" }}
          onSubmit={(e) => {
            e.preventDefault();
            setSent(true);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-bold" htmlFor="cp-name">
                {c.nameL}
              </label>
              <input
                id="cp-name"
                required
                className="w-full rounded-xl border px-4 py-2.5 text-[15px]"
                style={{ borderColor: "var(--border)" }}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-bold" htmlFor="cp-email">
                {c.emailL}
              </label>
              <input
                id="cp-email"
                type="email"
                required
                dir="ltr"
                className="w-full rounded-xl border px-4 py-2.5 text-[15px]"
                style={{ borderColor: "var(--border)" }}
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-bold" htmlFor="cp-msg">
              {c.msgL}
            </label>
            <textarea
              id="cp-msg"
              required
              rows={4}
              className="w-full rounded-xl border px-4 py-2.5 text-[15px]"
              style={{ borderColor: "var(--border)" }}
            />
          </div>
          <button type="submit" className="btn btn-primary self-start">
            {c.send}
          </button>
          {sent && (
            <p className="text-sm font-bold" style={{ color: "var(--accent)" }} role="status">
              {c.sent}
            </p>
          )}
        </form>
        <p className="mt-6 text-center text-sm" style={{ color: "var(--muted)" }}>
          {c.waT}{" "}
          <a href={WA} className="font-bold" style={{ color: "var(--accent)" }}>
            WhatsApp
          </a>
        </p>
      </div>
    </main>
  );
}
