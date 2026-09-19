import { useLang } from "./lang";

type TCard = {
  q: string;
  n: string;
  r: string;
};

function initials(name: string) {
  const parts = name.split(" ");
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function Card({ q, n, r, hidden }: TCard & { hidden?: boolean }) {
  return (
    <div className="tcard" aria-hidden={hidden ? "true" : undefined}>
      <blockquote>{q}</blockquote>
      <div className="rev-who">
        <span className="monogram">{initials(n)}</span>
        <div>
          <strong>{n}</strong>
          <span className="rev-role">{r}</span>
        </div>
      </div>
    </div>
  );
}

function Track({
  cards,
  dur,
  hideM,
  hideS,
}: {
  cards: TCard[];
  dur: string;
  hideM?: boolean;
  hideS?: boolean;
}) {
  const cls = ["mcol", hideM ? "hide-m" : "", hideS ? "hide-s" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls} role="listitem">
      <div className="mtrack" style={{ ["--dur" as string]: dur }}>
        {cards.map((c) => (
          <Card key={c.n} {...c} />
        ))}
        {cards.map((c) => (
          <Card key={`dup-${c.n}`} {...c} hidden />
        ))}
      </div>
    </div>
  );
}

export function Reviews() {
  const { t } = useLang();
  const r = t.reviews;
  return (
    <section
      className="section spot"
      data-od-id="team"
      id="team"
      aria-labelledby="team-h"
    >
      <div className="kt-wrap">
        <p className="eyebrow">{r.eyebrow}</p>
        <h2
          id="team-h"
          style={{ fontSize: "var(--fs-h2)", maxWidth: "22ch" }}
        >
          {r.h2}
        </h2>
        <div className="marquee reveal" role="list" aria-label="User testimonials">
          <Track cards={r.cards.slice(0, 3)} dur="24s" />
          <Track cards={r.cards.slice(3, 6)} dur="30s" hideM />
          <Track cards={r.cards.slice(6, 9)} dur="27s" hideM hideS />
        </div>
        <p className="meta" style={{ marginTop: 28 }}>
          {r.note}
        </p>
      </div>
    </section>
  );
}
