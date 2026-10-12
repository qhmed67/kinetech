import { useEffect, useRef, useState } from "react";
import {
  courseExists,
  getLastStoreError,
  getRawCourse,
  pushCourseNow,
  saveCourse,
  useContent,
  type StoreCourse,
} from "../store";
import { useLang } from "../components/lang";
import { Area, ChipInput, Field, RowActions, Section, Text } from "./ui";
import { ExamBuilder } from "./ExamBuilder";
import { extractDriveId, isUsableImageUrl, toDirectImageUrl } from "../lib/drive";
import { extractYoutubeId } from "../lib/videoGuard";

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
    sections: { en: [""], ar: [""] },
    videos: [{ src: "", mins: 10, assign: "", exam: "" }],
  };
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** Plain absolute-URL text field. No uploads, no local files, no data-URIs:
    every media asset lives at a production URL (Drive direct link, CDN). */
function LinkField({
  label,
  value,
  hint,
  onChange,
}: {
  label: string;
  value: string;
  hint?: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <div className="grid gap-2">
        <Text
          value={value}
          dir="ltr"
          placeholder="https://…"
          onChange={(e) => onChange(e.target.value)}
        />
        {hint && <p className="text-xs" style={{ color: "var(--muted)" }}>{hint}</p>}
      </div>
    </Field>
  );
}

/** Video URL field: accepts YouTube or Google Drive share links, with a
    live source badge so the admin sees what the student player will do. */
function VideoLinkField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const { lang, t } = useLang();
  const v = value.trim();
  const isYt = v !== "" && extractYoutubeId(v) !== null;
  const isDrive = !isYt && v !== "" && extractDriveId(v) !== null;
  const unknown = v !== "" && !isYt && !isDrive;
  return (
    <Field label={label}>
      <div className="grid gap-2">
        <Text
          value={value}
          dir="ltr"
          placeholder="https://…"
          onChange={(e) => onChange(e.target.value)}
        />
        {(isYt || isDrive) && (
          <p className="text-xs font-bold" style={{ color: "var(--accent)" }}>
            {isYt ? "YouTube ✓" : "Google Drive ✓"}
          </p>
        )}
        {unknown && (
          <p className="text-xs font-bold" role="alert" style={{ color: "#B3261E" }}>
            {lang === "ar"
              ? "رابط مش معروف — المشغّل ممكن ميشغلوش. الصق رابط YouTube أو Drive."
              : "Unrecognized link — the player may not play it. Paste a YouTube or Drive link."}
          </p>
        )}
        {hint && <p className="text-xs" style={{ color: "var(--muted)" }}>{hint}</p>}
        <p className="text-xs" style={{ color: "var(--muted)" }}>{t.admin.vidDriveHint}</p>
      </div>
    </Field>
  );
}
/** Image URL field with Google Drive auto-convert + live preview.
    Paste any Drive share link — it normalizes to a direct viewable URL. */
function ImageUrlField({
  label,
  value,
  hint,
  onChange,
}: {
  label: string;
  value: string;
  hint?: string;
  onChange: (v: string) => void;
}) {
  const { lang } = useLang();
  const direct = toDirectImageUrl(value);
  const ok = !value.trim() || isUsableImageUrl(direct);
  const preview = ok ? direct : "";
  return (
    <Field label={label}>
      <div className="grid gap-2">
        <Text
          value={value}
          dir="ltr"
          placeholder="https://drive.google.com/file/d/…"
          onChange={(e) => onChange(e.target.value)}
        />
        {hint && <p className="text-xs" style={{ color: "var(--muted)" }}>{hint}</p>}
        {value.trim() !== "" && !ok && (
          <p className="text-xs font-bold" role="alert" style={{ color: "#B3261E" }}>
            {lang === "ar" ? "رابط غير صالح — الصق رابط Drive أو رابط https مباشر." : "Invalid link — paste a Drive share link or a direct https URL."}
          </p>
        )}
        {preview !== "" && (
          <img
            src={preview}
            alt=""
            loading="lazy"
            className="h-28 rounded-xl object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        )}
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
  const [cloud, setCloud] = useState<"idle" | "syncing" | "ok" | "fail">("idle");
  const [cloudErr, setCloudErr] = useState("");
  const [saveTick, setSaveTick] = useState(0);
  // Dirty = admin typed something not yet saved. While pristine, the form
  // follows store updates (hydrates, other tabs) instead of showing stale
  // rows — the stale-editor overwrite that ate adds/deletes.
  const dirtyRef = useRef(false);
  const storeVersion = useContent();
  // Duration auto-detect: per-lesson "measuring…" flags + session memory of
  // already-probed links (paste → debounce → measure → fill minutes).
  const [detecting, setDetecting] = useState<Record<number, boolean>>({});
  const probedRef = useRef<Set<string>>(new Set());
  // Accordion: one open part at a time (long curricula stay scannable).
  const [openMod, setOpenMod] = useState<number | null>(0);

  // form follows the page language (global toggle in the admin header)
  useEffect(() => {
    setSaved(false);
    setCloud("idle");
  }, [lang]);

  // New course opened (or slug changed): load it fresh, clear edit state.
  useEffect(() => {
    setCourse(getRawCourse(slug ?? "") ?? blank());
    setErr("");
    setSaved(false);
    setCloud("idle");
    setCloudErr("");
    setDetecting({});
    setOpenMod(0);
    probedRef.current.clear();
    dirtyRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Pristine follow: store changed under us (hydrate, another tab) and we
  // have no unsaved edits — reload instead of showing stale rows.
  useEffect(() => {
    if (dirtyRef.current || !slug) return;
    const fresh = getRawCourse(slug);
    if (fresh && JSON.stringify(fresh) !== JSON.stringify(course)) setCourse(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeVersion, slug, course]);

  const set = (patch: Partial<StoreCourse>) => {
    setCourse((c) => ({ ...c, ...patch }));
    setSaved(false);
    setCloud("idle");
    dirtyRef.current = true;
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
    const sec = (which: "en" | "ar") => course.sections?.[which] ?? [];
    set({
      modules: { en: swap(course.modules.en), ar: swap(course.modules.ar) },
      sections: { en: swap(sec("en")), ar: swap(sec("ar")) },
      videos: swap(course.videos),
    });
  };
  const delMod = (i: number) => {
    if (course.modules.en.length <= 1) return;
    const drop = (arr: string[]) => arr.filter((_, k) => k !== i);
    set({
      modules: {
        en: course.modules.en.filter((_, k) => k !== i),
        ar: course.modules.ar.filter((_, k) => k !== i),
      },
      sections: {
        en: drop(course.sections?.en ?? []),
        ar: drop(course.sections?.ar ?? []),
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
      sections: {
        en: [...(course.sections?.en ?? []), ""],
        ar: [...(course.sections?.ar ?? []), ""],
      },
      videos: [...course.videos, { src: "", mins: 10, assign: "", exam: "" }],
    });
  const setMod = (i: number, k: "t" | "d", v: string) => {
    const next = [...course.modules[lt]];
    next[i] = { ...next[i], [k]: v };
    set({ modules: { ...course.modules, [lt]: next } });
  };
  const setSec = (i: number, v: string) => {
    const cur = [...(course.sections?.[lt] ?? [])];
    while (cur.length <= i) cur.push("");
    cur[i] = v;
    set({ sections: { en: course.sections?.en ?? [], ar: course.sections?.ar ?? [], [lt]: cur } });
  };
  const setVid = (i: number, patch: Partial<StoreCourse["videos"][number]>) => {
    const vids = [...course.videos];
    vids[i] = { ...vids[i], ...patch };
    set({ videos: vids });
  };

  // Measure one lesson's real length and fill its minutes. Applies only if
  // the link is unchanged since the probe started (slow YT API vs fast typing).
  const detectMins = async (i: number, src: string) => {
    const s = (src || "").trim();
    if (!s || typeof window === "undefined") return;
    setDetecting((d) => ({ ...d, [i]: true }));
    try {
      const { probeVideoDurationSecs } = await import("../lib/videoGuard");
      const secs = await probeVideoDurationSecs(s);
      if (typeof secs === "number" && secs > 0) {
        const mins = Math.max(1, Math.ceil(secs / 60));
        setCourse((c) => {
          if ((c.videos[i]?.src || "").trim() !== s) return c;
          const vids = [...c.videos];
          vids[i] = { ...vids[i], mins };
          return { ...c, videos: vids };
        });
        dirtyRef.current = true;
        setSaved(false);
        setCloud("idle");
      }
    } catch {
      /* keep the previous value */
    } finally {
      setDetecting((d) => ({ ...d, [i]: false }));
    }
  };

  // Paste → wait for typing to settle → measure every unprobed link.
  useEffect(() => {
    const t = window.setTimeout(() => {
      course.videos.forEach((v, i) => {
        const s = (v.src || "").trim();
        if (s && !probedRef.current.has(s)) {
          probedRef.current.add(s);
          void detectMins(i, s);
        }
      });
    }, 900);
    return () => window.clearTimeout(t);
  });

  const detectAll = () => {
    probedRef.current.clear();
    course.videos.forEach((v, i) => {
      const s = (v.src || "").trim();
      if (s) {
        probedRef.current.add(s);
        void detectMins(i, s);
      }
    });
  };

  const save = async () => {
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
    // Normalize Drive share links to direct URLs; drop any legacy data-URI.
    const photo = toDirectImageUrl(course.photoCard);
    const detailRaw = toDirectImageUrl(course.photoDetail);
    const photoDetail = detailRaw || photo;
    // Prune fully-blank lesson rows (no video, no titles, no section):
    // they would otherwise persist as empty months/parts forever.
    const keep = course.videos.map((_, i) => {
      const v = course.videos[i];
      const hasVideo = (v.src || "").trim() !== "" || (v.assign || "").trim() !== "" || (v.exam || "").trim() !== "";
      const t = (arr: Array<{ t: string; d: string }>) =>
        ((arr[i]?.t || "").trim() !== "" || (arr[i]?.d || "").trim());
      const hasText = t(course.modules.en) || t(course.modules.ar);
      const hasSec = ((course.sections.en[i] || "").trim() !== "" || (course.sections.ar[i] || "").trim() !== "");
      return hasVideo || hasText || hasSec;
    });
    const dropIdx = (arr: string[]) => arr.filter((_, i) => keep[i]);
    const dropMod = (arr: Array<{ t: string; d: string }>) => arr.filter((_, i) => keep[i]);
    const pruned: StoreCourse = {
      ...course,
      slug: s,
      photoCard: photo,
      photoDetail,
      modules: { en: dropMod(course.modules.en), ar: dropMod(course.modules.ar) },
      sections: { en: dropIdx(course.sections.en), ar: dropIdx(course.sections.ar) },
      videos: course.videos.filter((_, i) => keep[i]),
    };
    if (pruned.modules.en.length === 0) {
      pruned.modules = { en: [{ t: "", d: "" }], ar: [{ t: "", d: "" }] };
      pruned.sections = { en: [""], ar: [""] };
      pruned.videos = [{ src: "", mins: 10, assign: "", exam: "" }];
    }
    setCourse(pruned);
    // Local first (skip the fire-and-forget push — the awaited push below
    // replaces it, so two concurrent pushes can never duplicate modules).
    const ok = saveCourse(pruned, true);
    if (!ok) {
      const detail = getLastStoreError();
      setErr(detail ? `${a.storageFull} (${detail})` : a.storageFull);
      return;
    }
    setErr("");
    setSaved(true);
    if (isNew) window.location.hash = `#/admin/courses/${s}`;
    // Awaited cloud push: the UI says plainly whether the save reached the
    // DB — including the exact database reason on failure. On success the
    // exam builders remount (video ids now resolvable).
    setCloud("syncing");
    setCloudErr("");
    const res = await pushCourseNow(pruned);
    setCloud(res.ok ? "ok" : "fail");
    if (res.ok) {
      dirtyRef.current = false;
      setSaveTick((k) => k + 1);
    } else {
      setCloudErr(res.error ?? "");
    }
  };

  // Retry the cloud push with the CURRENT form state (slug normalized).
  const retryPush = async () => {
    const s = (isNew || !course.slug ? slug ?? "" : course.slug).trim() || course.slug.trim();
    setCloud("syncing");
    setCloudErr("");
    const res = await pushCourseNow({ ...course, slug: s });
    setCloud(res.ok ? "ok" : "fail");
    if (res.ok) {
      dirtyRef.current = false;
      setSaveTick((k) => k + 1);
    } else {
      setCloudErr(res.error ?? "");
    }
  };

  const statusText = !saved
    ? ""
    : cloud === "syncing"
      ? `${a.saved} …`
      : cloud === "ok"
        ? a.savedCloud
        : cloud === "fail"
          ? a.savedLocalOnly
          : a.saved;
  const statusColor = cloud === "fail" ? "#B3261E" : "var(--accent)";

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
      {saved && statusText && (
        <p role="status" className="text-sm font-bold" style={{ color: statusColor }}>{statusText}</p>
      )}
      {saved && cloud === "fail" && (
        <div className="grid gap-2">
          {cloudErr && (
            <p role="alert" dir="ltr" className="rounded-xl border px-4 py-2.5 text-[13px] font-bold" style={{ borderColor: "#B3261E", color: "#B3261E", background: "#FDF0EF" }}>
              {cloudErr}
            </p>
          )}
          <button type="button" onClick={retryPush} className="btn btn-secondary self-start" style={{ minHeight: 40, padding: "8px 18px", fontSize: 14 }}>
            {lt === "ar" ? "إعادة المزامنة" : "Retry cloud sync"}
          </button>
        </div>
      )}

      <Section title={a.secBasic}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={a.fName}>
            <Text value={course.name[lt]} dir={lt === "ar" ? "rtl" : "ltr"} onChange={(e) => setL("name", e.target.value)} />
          </Field>
          <Field label={a.fDur}>
            <Text
              type="number"
              min={1}
              dir="ltr"
              value={parseInt(course.duration.en, 10) || ""}
              placeholder="6"
              onChange={(e) => {
                const n = Math.max(1, parseInt(e.target.value, 10) || 0);
                if (!n) {
                  set({ duration: { en: "", ar: "" } });
                  return;
                }
                set({
                  duration: {
                    en: n === 1 ? "1 week" : `${n} weeks`,
                    ar: n === 1 ? "أسبوع" : n === 2 ? "أسبوعين" : `${n} أسابيع`,
                  },
                });
              }}
            />
          </Field>
          <Field label={a.fLessons}>
            <Text value={course.lessons[lt]} dir={lt === "ar" ? "rtl" : "ltr"} onChange={(e) => setL("lessons", e.target.value)} />
          </Field>
          <Field label={a.fSched}>
            <Text
              type="date"
              min={new Date().toISOString().slice(0, 10)}
              value={/^\d{4}-\d{2}-\d{2}$/.test(course.schedule[lt].trim()) ? course.schedule[lt].trim() : ""}
              dir="ltr"
              onChange={(e) => setL("schedule", e.target.value)}
            />
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
        <ImageUrlField label={a.fPhotoCard} value={course.photoCard} onChange={(v) => set({ photoCard: v })} />
        <ImageUrlField label={a.fPhotoDetail} value={course.photoDetail} onChange={(v) => set({ photoDetail: v })} />
      </Section>

      <Section title={a.secCurr}>
        {course.modules[lt].map((m, i) => {
          const open = openMod === i;
          const sec = (course.sections?.[lt]?.[i] ?? "").trim();
          const title = (m.t || "").trim();
          const vsrc = (course.videos[i]?.src ?? "").trim();
          const badge = vsrc === ""
            ? (lt === "ar" ? " · بلا فيديو" : " · no video")
            : extractYoutubeId(vsrc) !== null
              ? " · YouTube"
              : extractDriveId(vsrc) !== null
                ? " · Drive"
                : "";
          return (
          <div key={i} className="rounded-2xl border p-4" style={{ borderColor: "var(--kt-line)", background: "var(--surface)" }}>
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setOpenMod(open ? null : i)}
                aria-expanded={open}
                className="flex min-w-0 flex-1 items-center gap-2 text-start"
              >
                <strong className="flex-none" style={{ fontFamily: "var(--font-display)" }}>#{i + 1}</strong>
                <span className="min-w-0 flex-1 truncate text-sm" style={{ color: "var(--muted)" }}>
                  {[sec, title].filter(Boolean).join(" · ")}{badge}
                </span>
                <span aria-hidden="true" className="flex-none text-sm" style={{ color: "var(--muted)" }}>
                  {open ? "▾" : "▸"}
                </span>
              </button>
              <RowActions
                onUp={() => move(i, -1)}
                onDown={() => move(i, 1)}
                onDel={() => delMod(i)}
                upFirst={i === 0}
                downLast={i === course.modules[lt].length - 1}
              />
            </div>
            {open && (
            <div className="mt-3 grid gap-3">
              <Field label={a.secLabel}>
                <Text
                  value={course.sections?.[lt]?.[i] ?? ""}
                  dir={lt === "ar" ? "rtl" : "ltr"}
                  placeholder={a.secPh}
                  onChange={(e) => setSec(i, e.target.value)}
                />
              </Field>
              <Field label={a.modT}>
                <Text value={m.t} dir={lt === "ar" ? "rtl" : "ltr"} onChange={(e) => setMod(i, "t", e.target.value)} />
              </Field>
              <Field label={a.modD}>
                <Area value={m.d} dir={lt === "ar" ? "rtl" : "ltr"} onChange={(e) => setMod(i, "d", e.target.value)} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-[1fr_150px]">
                <VideoLinkField label={a.vidSrc} value={course.videos[i]?.src ?? ""} onChange={(v) => setVid(i, { src: v.trim() })} />
                <Field label={a.vidMins}>
                  <div className="grid gap-1">
                    <p dir="ltr" className="rounded-xl border bg-white px-4 py-2.5 text-[15px] font-bold" style={{ borderColor: "var(--border)" }}>
                      {detecting[i]
                        ? (lt === "ar" ? "بيقيس…" : "measuring…")
                        : `${course.videos[i]?.mins ?? 10} ${lt === "ar" ? "دقيقة (تلقائي)" : "min (auto)"}`}
                    </p>
                  </div>
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <LinkField label={a.vidAssign} value={course.videos[i]?.assign ?? ""} onChange={(v) => setVid(i, { assign: v.trim() })} />
                <LinkField label={a.vidExam} value={course.videos[i]?.exam ?? ""} onChange={(v) => setVid(i, { exam: v.trim() })} />
              </div>
              {!isNew && course.slug.trim() !== "" && (
                <div className="rounded-2xl border p-4" style={{ borderColor: "var(--kt-teal)", background: "#fff" }}>
                  <h4 className="font-bold" style={{ fontFamily: "var(--font-display)" }}>
                    {a.examBuilderT}
                  </h4>
                  <p className="mt-1 text-[13px]" style={{ color: "var(--muted)" }}>
                    {a.examBuilderD}
                  </p>
                  <div className="mt-3">
                    <ExamBuilder key={`${course.slug.trim()}:${i}:${saveTick}`} slug={course.slug.trim()} idx={i} />
                  </div>
                </div>
              )}
            </div>
            )}
          </div>
          );
        })}
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={addMod} className="btn btn-secondary self-start" style={{ minHeight: 40, padding: "8px 18px", fontSize: 14 }}>
            + {a.addMod}
          </button>
          <button type="button" onClick={detectAll} className="btn btn-secondary self-start" style={{ minHeight: 40, padding: "8px 18px", fontSize: 14 }}>
            {a.vidDetectAll}
          </button>
        </div>
      </Section>

      <Section title={a.outcomesT}>
        <ChipInput
          items={course.outcomes[lt]}
          onChange={(items) => set({ outcomes: { ...course.outcomes, [lt]: items } })}
        />
      </Section>

      <div className="grid gap-3">
        <div className="flex gap-3">
          <button type="button" onClick={save} className="btn btn-primary">
            {a.save}
          </button>
          {saved && statusText && (
            <p role="status" className="self-center text-sm font-bold" style={{ color: statusColor }}>{statusText}</p>
          )}
        </div>
        {saved && cloud === "fail" && (
          <div className="grid gap-2">
            {cloudErr && (
              <p role="alert" dir="ltr" className="rounded-xl border px-4 py-2.5 text-[13px] font-bold" style={{ borderColor: "#B3261E", color: "#B3261E", background: "#FDF0EF" }}>
                {cloudErr}
              </p>
            )}
            <button type="button" onClick={retryPush} className="btn btn-secondary self-start" style={{ minHeight: 40, padding: "8px 18px", fontSize: 14 }}>
              {lt === "ar" ? "إعادة المزامنة" : "Retry cloud sync"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
