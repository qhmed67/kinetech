import { useLang } from "../components/lang";

export function About() {
  const { t } = useLang();
  return (
    <main id="content" className="section">
      <div className="kt-wrap" style={{ maxWidth: 820 }}>
        <p className="eyebrow">{t.misc.aboutEyebrow}</p>
        <h1 style={{ fontSize: "var(--fs-h2)" }}>{t.misc.aboutH}</h1>
        <h2
          className="mt-8 text-2xl font-bold"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {t.pillars.bigH}
        </h2>
        <p className="lead mt-3">{t.pillars.bigP}</p>
        <h2
          className="mt-8 text-2xl font-bold"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {t.pillars.mindH}
        </h2>
        <p className="lead mt-3">{t.pillars.mindP}</p>
        <p className="mt-8 font-bold" style={{ color: "var(--accent)" }}>
          {t.footer.tag}
        </p>
        <div
          className="mt-8 rounded-[24px] p-7 text-white md:p-9"
          style={{ background: "var(--kt-dark-gradient)" }}
        >
          <h2
            className="text-2xl font-bold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {t.aboutBac.t}
          </h2>
          <p className="mt-2 max-w-[52ch] text-white/80">{t.aboutBac.d}</p>
          <a href="#/baccalaureate" className="btn btn-light mt-5">
            {t.aboutBac.cta}
          </a>
        </div>
      </div>
    </main>
  );
}
