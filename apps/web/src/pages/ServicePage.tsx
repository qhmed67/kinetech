import { getPosts, getProcess, getService, useContent } from "../store";
import { useLang } from "../components/lang";

const WA = "https://wa.me/201042031062";

const SLUGS = ["marketing", "software", "design"] as const;

export function ServicePage({ slug }: { slug: (typeof SLUGS)[number] }) {
  const { lang, t } = useLang();
  const s = t.services;
  useContent();
  const data = getService(lang, slug);
  const process = getProcess(lang);
  const posts = getPosts(lang, slug);
  const others = SLUGS.filter((x) => x !== slug);
  const otherTitle = (x: (typeof SLUGS)[number]) => getService(lang, x).title;
  return (
    <main id="content" className="section">
      <div className="kt-wrap">
        <p className="eyebrow">{s.eyebrow}</p>
        <h1 style={{ fontSize: "var(--fs-h2)" }}>{data.title}</h1>
        <p className="lead mt-3">{data.desc}</p>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <div
            className="rounded-[22px] border bg-white p-7"
            style={{ borderColor: "var(--kt-line)" }}
          >
            <h2
              className="text-xl font-bold"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {s.noteH}
            </h2>
            <ul className="mt-4 grid gap-3">
              {data.items.map((item) => (
                <li key={item} className="checkrow">
                  <span className="badge-dot">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                      <path d="M4 12.5 9.5 18 20 6.5" />
                    </svg>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div
            className="rounded-[22px] p-7 text-white"
            style={{ background: "var(--kt-deep)" }}
          >
            <h2
              className="text-xl font-bold"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {s.gets}
            </h2>
            <ul className="mt-4 grid gap-3 text-[15px] font-bold">
              {data.gets.map((g) => (
                <li key={g} className="flex items-center gap-3">
                  <span
                    className="grid h-7 w-7 flex-none place-items-center rounded-lg"
                    style={{ background: "var(--kt-teal)", color: "var(--kt-deep)" }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3.5 w-3.5" aria-hidden="true">
                      <path d="M4 12.5 9.5 18 20 6.5" />
                    </svg>
                  </span>
                  {g}
                </li>
              ))}
            </ul>
            <a href={WA} className="btn btn-light mt-6">
              {s.noteCta}
            </a>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          {others.map((x) => (
            <a key={x} href={`#/services/${x}`} className="btn btn-secondary">
              {otherTitle(x)}
            </a>
          ))}
        </div>

        <h2
          className="mt-14 text-2xl font-bold md:text-3xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {s.processT}
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {process.map((p, i) => (
            <div
              key={p.t}
              className="rounded-[20px] border bg-white p-6"
              style={{ borderColor: "var(--kt-line)" }}
            >
              <span
                className="grid h-10 w-10 place-items-center rounded-xl font-bold text-white"
                style={{
                  background: i === 1 ? "var(--kt-teal)" : "var(--kt-gradient)",
                  color: i === 1 ? "var(--kt-deep)" : "#fff",
                  fontFamily: "var(--font-display)",
                }}
              >
                {i + 1}
              </span>
              <h3
                className="mt-3 font-bold"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {p.t}
              </h3>
              <p className="mt-1.5 text-sm" style={{ color: "var(--muted)" }}>
                {p.d}
              </p>
            </div>
          ))}
        </div>

        <h2
          className="mt-14 text-2xl font-bold md:text-3xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {s.portfolioT}
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {data.gets.map((g, i) => (
            <div
              key={g}
              className="flex min-h-[150px] flex-col justify-end overflow-hidden rounded-[20px] p-5"
              style={{
                background:
                  i === 0
                    ? "var(--kt-gradient)"
                    : i === 1
                      ? "var(--kt-deep)"
                      : "var(--surface)",
                color: i === 2 ? "var(--fg)" : "#fff",
              }}
            >
              <p className="font-bold" style={{ fontFamily: "var(--font-display)" }}>
                {g}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <a href={WA} className="btn btn-primary">
            {s.noteCta}
          </a>
        </div>

        {posts.length > 0 && (
          <>
            <h2
              className="mt-14 text-2xl font-bold md:text-3xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {t.admin.postsT}
            </h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((p, i) => (
                <article
                  key={`${p.title}-${i}`}
                  className="overflow-hidden rounded-[20px] border bg-white"
                  style={{ borderColor: "var(--kt-line)" }}
                >
                  {p.image && (
                    <img src={p.image} alt="" loading="lazy" className="h-44 w-full object-cover" />
                  )}
                  <div className="p-5">
                    <h3 className="font-bold" style={{ fontFamily: "var(--font-display)" }}>
                      {p.title}
                    </h3>
                    {p.text && (
                      <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                        {p.text}
                      </p>
                    )}
                    {p.link && (
                      <a
                        href={p.link}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-block text-sm font-bold"
                        style={{ color: "var(--accent)" }}
                      >
                        →
                      </a>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
