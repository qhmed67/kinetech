import { useLang } from "../components/lang";

export function NotFound() {
  const { t } = useLang();
  return (
    <main id="content" className="section">
      <div className="kt-wrap" style={{ maxWidth: 640, textAlign: "center" }}>
        <p
          className="mx-auto grid h-20 w-20 place-items-center rounded-full text-3xl font-bold text-white"
          style={{
            background: "var(--kt-gradient)",
            fontFamily: "var(--font-display)",
          }}
          aria-hidden="true"
        >
          ?
        </p>
        <h1 className="mt-6" style={{ fontSize: "var(--fs-h2)" }}>
          {t.misc.notfoundT}
        </h1>
        <p className="lead mx-auto mt-3">{t.misc.notfoundD}</p>
        <a href="#/" className="btn btn-primary mt-6">
          {t.misc.home}
        </a>
      </div>
    </main>
  );
}
