import { useState } from "react";
import { loadStore, saveService, useContent, type Post } from "../store";
import { useLang } from "../components/lang";
import { Field, LangTabs, RowActions, Section, StringList, Text, Area } from "./ui";

type Svc = "marketing" | "software" | "design";

const blankPost = (): Post => ({ title: "", text: "", image: "", link: "" });

export function ServicesEditor() {
  const { lang, t } = useLang();
  const a = t.admin;
  useContent();
  const [svc, setSvc] = useState<Svc>("marketing");
  const [lt, setLt] = useState<"en" | "ar">(lang === "ar" ? "ar" : "en");

  const store = loadStore();
  const posts = store.services[svc].posts[lt] ?? [];

  // saveService commits + notifies via useContent — no remount key needed.
  // (A previous key={tick} remounted the whole form on every keystroke,
  // stealing input focus while typing.)
  const write = (next: Post[]) => {
    const cur = loadStore().services[svc];
    saveService(svc, { ...cur, posts: { ...cur.posts, [lt]: next } });
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= posts.length) return;
    const next = [...posts];
    [next[i], next[j]] = [next[j], next[i]];
    write(next);
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
          {a.servicesT}
        </h1>
        <LangTabs value={lt} onChange={setLt} />
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="service">
        {(["marketing", "software", "design"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSvc(s)}
            aria-pressed={svc === s}
            className="rounded-full px-5 py-2 text-sm font-bold"
            style={
              svc === s
                ? { background: "var(--accent)", color: "#fff", fontFamily: "var(--font-display)" }
                : { background: "#fff", color: "var(--muted)", fontFamily: "var(--font-display)", border: "1px solid var(--kt-line)" }
            }
          >
            {s}
          </button>
        ))}
      </div>

      <Section title={`${svc} · ${a.svcTitle ?? "Title"}`}>
        <Field label={a.svcTitle ?? "Title"}>
          <Text
            value={store.services[svc].title[lt] ?? ""}
            dir={lt === "ar" ? "rtl" : "ltr"}
            onChange={(e) => {
              const cur = loadStore().services[svc];
              saveService(svc, { ...cur, title: { ...cur.title, [lt]: e.target.value } });
            }}
          />
        </Field>
        <Field label={a.svcDesc ?? "Description"}>
          <Area
            value={store.services[svc].desc[lt] ?? ""}
            dir={lt === "ar" ? "rtl" : "ltr"}
            onChange={(e) => {
              const cur = loadStore().services[svc];
              saveService(svc, { ...cur, desc: { ...cur.desc, [lt]: e.target.value } });
            }}
          />
        </Field>
        <Field label={a.svcItems ?? "Feature list"}>
          <StringList
            items={store.services[svc].items[lt] ?? []}
            addLabel={a.addItem}
            onChange={(items) => {
              const cur = loadStore().services[svc];
              saveService(svc, { ...cur, items: { ...cur.items, [lt]: items } });
            }}
          />
        </Field>
        <Field label={a.svcGets ?? "Deliverables"}>
          <StringList
            items={store.services[svc].gets[lt] ?? []}
            addLabel={a.addItem}
            onChange={(items) => {
              const cur = loadStore().services[svc];
              saveService(svc, { ...cur, gets: { ...cur.gets, [lt]: items } });
            }}
          />
        </Field>
      </Section>

      <Section title={svc}>
        {posts.map((p, i) => (
          <div key={i} className="rounded-2xl border p-4" style={{ borderColor: "var(--kt-line)", background: "var(--surface)" }}>
            <div className="flex items-center justify-between gap-2">
              <strong style={{ fontFamily: "var(--font-display)" }}>#{i + 1}</strong>
              <RowActions
                onUp={() => move(i, -1)}
                onDown={() => move(i, 1)}
                onDel={() => write(posts.filter((_, k) => k !== i))}
                upFirst={i === 0}
                downLast={i === posts.length - 1}
              />
            </div>
            <div className="mt-3 grid gap-3">
              <Field label={a.postTitle ?? "Title"}>
                <Text value={p.title} dir={lt === "ar" ? "rtl" : "ltr"} onChange={(e) => {
                  const next = [...posts];
                  next[i] = { ...next[i], title: e.target.value };
                  write(next);
                }} />
              </Field>
              <Field label={a.postText ?? "Text"}>
                <Area value={p.text} dir={lt === "ar" ? "rtl" : "ltr"} onChange={(e) => {
                  const next = [...posts];
                  next[i] = { ...next[i], text: e.target.value };
                  write(next);
                }} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={a.postImage ?? "Image"}>
                  <Text value={p.image} dir="ltr" placeholder="assets/… or https://…" onChange={(e) => {
                    const next = [...posts];
                    next[i] = { ...next[i], image: e.target.value };
                    write(next);
                  }} />
                </Field>
                <Field label={a.postLink ?? "Link"}>
                  <Text value={p.link} dir="ltr" placeholder="https://…" onChange={(e) => {
                    const next = [...posts];
                    next[i] = { ...next[i], link: e.target.value };
                    write(next);
                  }} />
                </Field>
              </div>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => write([...posts, blankPost()])}
          className="btn btn-secondary self-start"
          style={{ minHeight: 40, padding: "8px 18px", fontSize: 14 }}
        >
          + {a.addPost ?? a.addItem}
        </button>
      </Section>
    </div>
  );
}
