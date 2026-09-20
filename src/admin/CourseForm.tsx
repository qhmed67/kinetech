import { useEffect, useState } from "react";
import {
  courseExists,
  getLastStoreError,
  getRawCourse,
  saveCourse,
  type StoreCourse,
} from "../store";
import { useLang } from "../components/lang";
import { Area, Field, RowActions, Section, Text } from "./ui";

function blank(): StoreCourse {
  const lt = { en: "", ar: "" };
  return {
    slug: "",
    cat: "tech",
    bac: false,
    cta: { en: "Buy Now", ar: "اشتري الآن" },
    name: { ...lt },
    designation: { en: "Our course", ar: "كورسنا" },
    quote: { ...lt },
    duration: { ...lt },
    lessons: { ...lt },
    schedule: { ...lt },
    level: { en: "Beginner", ar: "مبتدئ" },
    seats: { en: "Limited", ar: "محدودة" },
    seatsN: 6,
    price: null,
    photoCard: "",
    photoDetail: "",
    instructor: { name: { ...lt }, spec: { ...lt }, bio: { ...lt } },
    outcomes: { en: [], ar: [] },
    modules: { en: [{ t: "", d: "" }], ar: [{ t: "", d: "" }] },
    videos: [{ src: "", mins: 10, assign: "", exam: "" }],
  };
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function fileToDataUrl(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result ?? ""));
    r.onerror = () => rej(new Error("read"));
    r.readAsDataURL(f);
  });
}

/** URL text field + file upload writing into the same slot. */
function UrlOrFile({
  label,
  value,
  accept,
  onChange,
}: {
  label: string;
  value: string;
  accept?: string;
  onChange: (v: string) => void;
}) {
  const { t } = useLang();
  const a = t.admin;
  const isFile = value.startsWith("data:");
  const kb = isFile ? Math.round((value.length * 3) / 4 / 1024) : 0;
  return (
    <Field label={label}>
      <div className="grid gap-2">
        <Text
          value={isFile ? "" : value}
          dir="ltr"
          placeholder="https://…"
          onChange={(e) => onChange(e.target.value)}
        />
        <label className="flex cursor-pointer items-center gap-2 text-[13px] font-bold" style={{ color: "var(--accent)" }}>
          <input
            type="file"
            accept={accept}
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                onChange(await fileToDataUrl(f));
              } catch {
                /* ignore */
              }
              e.target.value = "";
            }}
          />
          <span className="rounded-full border px-3 py-1" style={{ borderColor: "var(--border)" }}>
            {a.uploadL}
          </span>
          {isFile && (
            <span className="font-medium" style={{ color: "var(--muted)" }}>
              attached (~{kb} KB)
            </span>
          )}
        </label>
        <p className="text-xs" style={{ color: "var(--muted)" }}>{a.fileBig}</p>
      </div>
    </Field>
  );
}

type TrackOpt = "bac" | "tech" | "other";

export function CourseForm({ slug }: { slug?: string }) {
  const { lang, t } = useLang();
  const a = t.admin;
  const isNew = !slug;
  const [course, setCourse] = useState<StoreCourse>(() => getRawCourse(slug ?? "") ?? blank());
  const lt: "en" | "ar" = lang === "ar" ? "ar" : "en";
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);

  // form follows the page language (global toggle in the admin header)
  useEffect(() => {
    setSaved(false);
  }, [lang]);

  const set = (patch: Partial<StoreCourse>) => {
    setCourse((c) => ({ ...c, ...patch }));
    setSaved(false);
  };
  const setL = (key: "name" | "quote" | "duration" | "lessons" | "schedule", v: string) =>
    set({ [key]: { ...course[key], [lt]: v } } as Partial<StoreCourse>);

  const track: TrackOpt = course.bac ? "bac" : course.cat === "other" ? "other" : "tech";
  const setTrack = (tr: TrackOpt) => {
    if (tr === "bac") set({ bac: true });
    else set({ bac: false, cat: tr });
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= course.modules.en.length) return;
    const swap = <T,>(arr: T[]): T[] => {
      const n = [...arr];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    };
    set({
      modules: { en: swap(course.modules.en), ar: swap(course.modules.ar) },
      videos: swap(course.videos),
    });
  };
  const delMod = (i: number) => {
    if (course.modules.en.length <= 1) return;
    set({
      modules: {
        en: course.modules.en.filter((_, k) => k !== i),
        ar: course.modules.ar.filter((_, k) => k !== i),
      },
      videos: course.videos.filter((_, k) => k !== i),
    });
  };
  const addMod = () =>
    set({
      modules: {
        en: [...course.modules.en, { t: "", d: "" }],
        ar: [...course.modules.ar, { t: "", d: "" }],
      },
      videos: [...course.videos, { src: "", mins: 10, assign: "", exam: "" }],
    });
  const setMod = (i: number, k: "t" | "d", v: string) => {
    const next = [...course.modules[lt]];
    next[i] = { ...next[i], [k]: v };
    set({ modules: { ...course.modules, [lt]: next } });
  };
  const setVid = (i: number, patch: Partial<StoreCourse["videos"][number]>) => {
    const vids = [...course.videos];
    vids[i] = { ...vids[i], ...patch };
    set({ videos: vids });
  };

  const save = () => {
    const name = course.name.en.trim() || course.name.ar.trim();
    if (!name) {
      setErr(a.required);
      return;
    }
    let s = isNew || !course.slug
      ? slugify(course.name.en) || slugify(course.name.ar) || `course-${Date.now()}`
      : course.slug.trim();
    if ((isNew || s !== slug) && courseExists(s)) {
      let n = 2;
      while (courseExists(`${s}-${n}`)) n += 1;
      s = `${s}-${n}`;
    }
    const photo = course.photoCard.trim();
    // never persist an uploaded data-URL as the detail image: the trimmed
    // form has no input for it, so a stale one would silently blow the quota
    const detailRaw = course.photoDetail.trim();
    const photoDetail = detailRaw && !detailRaw.startsWith("data:") ? detailRaw : photo;
    const ok = saveCourse({ ...course, slug: s, photoDetail });
    if (!ok) {
      const detail = getLastStoreError();
      setErr(detail ? `${a.storageFull} (${detail})` : a.storageFull);
      return;
    }
    setErr("");
    setSaved(true);
    if (isNew) window.location.hash = `#/admin/courses/${s}`;
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
          {isNew ? a.addCourse : course.name[lt] || course.slug}
        </h1>
        <div className="flex items-center gap-3">
          <a href="#/admin/courses" className="btn btn-secondary" style={{ minHeight: 40, padding: "8px 18px", fontSize: 14 }}>
            {a.back}
          </a>
          <button type="button" onClick={save} className="btn btn-primary" style={{ minHeight: 40, padding: "8px 22px", fontSize: 14 }}>
            {a.save}
          </button>
        </div>
      </div>
      {err && (
        <p role="alert" className="text-sm font-bold" style={{ color: "#B3261E" }}>{err}</p>
      )}
      {saved && (
        <p role="status" className="text-sm font-bold" style={{ color: "var(--accent)" }}>{a.saved}</p>
      )}

      <Section title={a.secBasic}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={a.fName}>
            <Text value={course.name[lt]} dir={lt === "ar" ? "rtl" : "ltr"} onChange={(e) => setL("name", e.target.value)} />
          </Field>
          <Field label={a.fDur}>
            <Text value={course.duration[lt]} dir={lt === "ar" ? "rtl" : "ltr"} onChange={(e) => setL("duration", e.target.value)} />
          </Field>
          <Field label={a.fLessons}>
            <Text value={course.lessons[lt]} dir={lt === "ar" ? "rtl" : "ltr"} onChange={(e) => setL("lessons", e.target.value)} />
          </Field>
          <Field label={a.fSched}>
            <Text value={course.schedule[lt]} dir={lt === "ar" ? "rtl" : "ltr"} onChange={(e) => setL("schedule", e.target.value)} />
          </Field>
        </div>
        <Field label={a.fQuote}>
          <Area value={course.quote[lt]} dir={lt === "ar" ? "rtl" : "ltr"} onChange={(e) => setL("quote", e.target.value)} />
        </Field>
        <Field label={a.fPrice}>
          <Text
            value={course.price?.[lt] ?? ""}
            dir={lt === "ar" ? "rtl" : "ltr"}
            placeholder={a.fPricePh}
            onChange={(e) => {
              const v = e.target.value;
              const cur = course.price ?? { en: "", ar: "" };
              const next = { ...cur, [lt]: v };
              set({ price: next.en.trim() || next.ar.trim() ? next : null });
            }}
          />
        </Field>
        <Field label={a.fTrack}>
          <div className="flex flex-wrap gap-2" role="group" aria-label={a.fTrack}>
            {(["bac", "tech", "other"] as const).map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setTrack(o)}
                aria-pressed={track === o}
                className="rounded-full px-5 py-2 text-sm font-bold"
                style={
                  track === o
                    ? { background: "var(--accent)", color: "#fff", fontFamily: "var(--font-display)" }
                    : { background: "var(--surface)", color: "var(--muted)", fontFamily: "var(--font-display)" }
                }
              >
                {o === "bac" ? a.trackBac : o === "tech" ? a.trackTech : a.trackOther}
              </button>
            ))}
          </div>
        </Field>
      </Section>

      <Section title={a.secMedia}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={a.fInsName}>
            <Text value={course.instructor.name[lt]} dir={lt === "ar" ? "rtl" : "ltr"} onChange={(e) => set({ instructor: { ...course.instructor, name: { ...course.instructor.name, [lt]: e.target.value } } })} />
          </Field>
          <Field label={a.fInsSpec}>
            <Text value={course.instructor.spec[lt]} dir={lt === "ar" ? "rtl" : "ltr"} onChange={(e) => set({ instructor: { ...course.instructor, spec: { ...course.instructor.spec, [lt]: e.target.value } } })} />
          </Field>
        </div>
        <UrlOrFile label={a.fPhotoCard} value={course.photoCard} accept="image/*" onChange={(v) => set({ photoCard: v })} />
        {course.photoCard && (
          <img src={course.photoCard} alt="" className="h-28 rounded-xl object-cover" />
        )}
      </Section>

      <Section title={a.secCurr}>
        {course.modules[lt].map((m, i) => (
          <div key={i} className="rounded-2xl border p-4" style={{ borderColor: "var(--kt-line)", background: "var(--surface)" }}>
            <div className="flex items-center justify-between gap-2">
              <strong style={{ fontFamily: "var(--font-display)" }}>#{i + 1}</strong>
              <RowActions
                onUp={() => move(i, -1)}
                onDown={() => move(i, 1)}
                onDel={() => delMod(i)}
                upFirst={i === 0}
                downLast={i === course.modules[lt].length - 1}
              />
            </div>
            <div className="mt-3 grid gap-3">
              <Field label={a.modT}>
                <Text value={m.t} dir={lt === "ar" ? "rtl" : "ltr"} onChange={(e) => setMod(i, "t", e.target.value)} />
              </Field>
              <Field label={a.modD}>
                <Area value={m.d} dir={lt === "ar" ? "rtl" : "ltr"} onChange={(e) => setMod(i, "d", e.target.value)} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-[1fr_110px]">
                <UrlOrFile label={a.vidSrc} value={course.videos[i]?.src ?? ""} accept="video/*" onChange={(v) => setVid(i, { src: v })} />
                <Field label={a.vidMins}>
                  <Text type="number" dir="ltr" value={course.videos[i]?.mins ?? 10} onChange={(e) => setVid(i, { mins: parseInt(e.target.value, 10) || 0 })} />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <UrlOrFile label={a.vidAssign} value={course.videos[i]?.assign ?? ""} onChange={(v) => setVid(i, { assign: v })} />
                <UrlOrFile label={a.vidExam} value={course.videos[i]?.exam ?? ""} onChange={(v) => setVid(i, { exam: v })} />
              </div>
            </div>
          </div>
        ))}
        <button type="button" onClick={addMod} className="btn btn-secondary self-start" style={{ minHeight: 40, padding: "8px 18px", fontSize: 14 }}>
          + {a.addMod}
        </button>
      </Section>

      <div className="flex gap-3">
        <button type="button" onClick={save} className="btn btn-primary">
          {a.save}
        </button>
        {saved && (
          <p role="status" className="self-center text-sm font-bold" style={{ color: "var(--accent)" }}>{a.saved}</p>
        )}
      </div>
    </div>
  );
}
