import { useLang } from "../components/lang";

function Shell({ title, paragraphs }: { title: string; paragraphs: string[] }) {
  const { t } = useLang();
  return (
    <main id="content" className="section">
      <div className="kt-wrap" style={{ maxWidth: 760 }}>
        <h1 style={{ fontSize: "var(--fs-h2)" }}>{title}</h1>
        <p
          className="mt-3 inline-block rounded-full px-4 py-1.5 text-xs font-bold"
          style={{
            background: "var(--teal-soft)",
            color: "var(--kt-deep)",
            fontFamily: "var(--font-display)",
          }}
        >
          {t.legal.pending}
        </p>
        {paragraphs.map((p) => (
          <p key={p.slice(0, 24)} className="lead mt-5">
            {p}
          </p>
        ))}
        <p className="mt-8 text-sm" style={{ color: "var(--muted)" }}>
          <a href="#/" style={{ color: "var(--accent)", fontWeight: 700 }}>
            {t.misc.home}
          </a>{" "}
          ·{" "}
          <a href="#/contact" style={{ color: "var(--accent)", fontWeight: 700 }}>
            {t.contactPage.h2}
          </a>
        </p>
      </div>
    </main>
  );
}

export function Privacy() {
  const { t } = useLang();
  return <Shell title={t.legal.privacyT} paragraphs={t.legal.pP} />;
}

export function Terms() {
  const { t } = useLang();
  return <Shell title={t.legal.termsT} paragraphs={t.legal.tP} />;
}
