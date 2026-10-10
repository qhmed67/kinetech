import { useEffect, useState } from "react";
import { useLang } from "../components/lang";
import { Field, Text, Area } from "./ui";
import {
  getExam,
  newQuestion,
  saveExam,
  videoIdBySlug,
  type ExamContent,
  type ExamKind,
} from "../lib/db/examsDb";

/**
 * Per-lesson exam/assignment builder. Loads the structured content stored on
 * the video row (not the legacy single-link fields), edits locally, saves
 * explicitly. Choice questions carry their own options + correct answer;
 * writing questions carry only a prompt and wait for instructor grading.
 */
export function ExamBuilder({ slug: courseSlug, idx }: { slug: string; idx: number }) {
  const { lang, t } = useLang();
  const x = t.exam;
  const [tab, setTab] = useState<ExamKind>("exam");
  const [videoId, setVideoId] = useState<string | null>(null);
  const [content, setContent] = useState<ExamContent>({ title: "", questions: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setSaved(false);
    void videoIdBySlug(courseSlug, idx)
      .then(async (id) => {
        if (!alive) return;
        setVideoId(id);
        if (id) {
          const c = await getExam(id, tab).catch(() => null);
          if (alive && c) setContent(c);
          else if (alive) setContent({ title: "", questions: [] });
        }
        if (alive) setLoading(false);
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [courseSlug, idx, tab]);

  if (loading) return <p className="text-sm" style={{ color: "var(--muted)" }}>…</p>;
  if (!videoId) {
    return <p className="text-sm" style={{ color: "var(--muted)" }}>{x.saveCourseFirst}</p>;
  }

  const setQ = (qi: number, patch: Partial<ExamContent["questions"][number]>) => {
    setContent((c) => ({
      ...c,
      questions: c.questions.map((q, k) => (k === qi ? { ...q, ...patch } : q)),
    }));
    setSaved(false);
  };

  const save = async () => {
    if (saving || !videoId) return;
    setSaving(true);
    setErr("");
    try {
      await saveExam(videoId, tab, content);
      setSaved(true);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-3">
      <div className="flex gap-2" role="group" aria-label="kind">
        {(["exam", "assignment"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            aria-pressed={tab === k}
            className="rounded-full px-4 py-1.5 text-xs font-bold"
            style={tab === k
              ? { background: "var(--kt-deep)", color: "#fff" }
              : { background: "var(--surface)", color: "var(--muted)" }}
          >
            {k === "exam" ? x.examT : x.assignT}
          </button>
        ))}
      </div>

      <Field label={x.examTitle}>
        <Text
          value={content.title}
          dir={lang === "ar" ? "rtl" : "ltr"}
          placeholder={x.examTitlePh}
          onChange={(e) => {
            setContent((c) => ({ ...c, title: e.target.value }));
            setSaved(false);
          }}
        />
      </Field>

      {content.questions.map((q, qi) => (
        <div key={q.id} className="rounded-2xl border bg-white p-4" style={{ borderColor: "var(--kt-line)" }}>
          <div className="flex items-center justify-between gap-2">
            <strong style={{ fontFamily: "var(--font-display)" }}>
              #{qi + 1} · {q.kind === "choice" ? x.qChoice : x.qWriting}
            </strong>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setQ(qi, { kind: q.kind === "choice" ? "writing" : "choice", choices: q.kind === "choice" ? [] : ["", "", "", ""], correct: 0 })}
                className="text-xs font-bold"
                style={{ color: "var(--accent)" }}
              >
                {x.switchKind}
              </button>
              <button
                type="button"
                onClick={() => {
                  setContent((c) => ({ ...c, questions: c.questions.filter((_, k) => k !== qi) }));
                  setSaved(false);
                }}
                className="text-xs font-bold"
                style={{ color: "#B3261E" }}
              >
                {x.delQ}
              </button>
            </div>
          </div>
          <div className="mt-2">
            <Field label={x.qPrompt}>
              <Area
                value={q.prompt}
                dir={lang === "ar" ? "rtl" : "ltr"}
                onChange={(e) => setQ(qi, { prompt: e.target.value })}
              />
            </Field>
          </div>
          {q.kind === "choice" && (
            <div className="mt-2 grid gap-2">
              {q.choices.map((c, ci) => (
                <label key={ci} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={`${q.id}-correct`}
                    checked={q.correct === ci}
                    onChange={() => setQ(qi, { correct: ci })}
                    className="h-4 w-4 accent-[#6E4E9C]"
                    aria-label={x.correctMark}
                  />
                  <input
                    value={c}
                    dir={lang === "ar" ? "rtl" : "ltr"}
                    placeholder={`${x.choicePh} ${ci + 1}`}
                    onChange={(e) => {
                      const next = [...q.choices];
                      next[ci] = e.target.value;
                      setQ(qi, { choices: next });
                    }}
                    className="min-h-[40px] flex-1 rounded-xl border bg-white px-3 text-sm"
                    style={{ borderColor: "var(--border)" }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const next = q.choices.filter((_, k) => k !== ci);
                      setQ(qi, {
                        choices: next,
                        correct: q.correct !== null && q.correct >= next.length ? 0 : q.correct,
                      });
                    }}
                    aria-label="remove"
                    className="grid h-10 w-10 flex-none place-items-center rounded-xl border"
                    style={{ borderColor: "var(--border)", color: "#B3261E" }}
                  >
                    ×
                  </button>
                </label>
              ))}
              <button
                type="button"
                onClick={() => setQ(qi, { choices: [...q.choices, ""] })}
                className="self-start text-xs font-bold"
                style={{ color: "var(--accent)" }}
              >
                + {x.addChoice}
              </button>
            </div>
          )}
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => { setContent((c) => ({ ...c, questions: [...c.questions, newQuestion("choice")] })); setSaved(false); }} className="btn btn-secondary" style={{ minHeight: 40 }}>
          + {x.addChoiceQ}
        </button>
        <button type="button" onClick={() => { setContent((c) => ({ ...c, questions: [...c.questions, newQuestion("writing")] })); setSaved(false); }} className="btn btn-secondary" style={{ minHeight: 40 }}>
          + {x.addWritingQ}
        </button>
        <button type="button" onClick={() => void save()} disabled={saving} className="btn btn-primary disabled:opacity-60" style={{ minHeight: 40 }}>
          {x.saveExam}
        </button>
        {saved && <span className="self-center text-sm font-bold" style={{ color: "var(--accent)" }}>✓</span>}
      </div>
      {err !== "" && (
        <p role="alert" className="text-sm font-bold" style={{ color: "#B3261E" }}>{err}</p>
      )}
    </div>
  );
}
