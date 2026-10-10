import { useEffect, useState } from "react";
import { useLang } from "./lang";
import {
  getMyResult,
  submitAttempt,
  type ExamContent,
  type ExamKind,
  type ExamResult,
} from "../lib/db/examsDb";

/**
 * Take-flow for one lesson exam/assignment. Choice answers score instantly;
 * any writing answer leaves the attempt pending until an instructor grades
 * it — the student sees the pending state, never a fake final score.
 */
export function ExamTake({
  videoId,
  kind,
  content,
  onClose,
  startInReview,
}: {
  videoId: string;
  kind: ExamKind;
  content: ExamContent;
  onClose: () => void;
  startInReview?: boolean;
}) {
  const { t } = useLang();
  const x = t.exam;
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<ExamResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(startInReview ?? false);

  useEffect(() => {
    let alive = true;
    void getMyResult(videoId, kind)
      .then((r) => {
        if (!alive) return;
        if (r) {
          setResult(r);
          setAnswers(r.answers ?? {});
        }
      })
      .catch(() => {
        /* fresh attempt */
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [videoId, kind]);

  const submit = async () => {
    if (busy || result?.status === "graded") return;
    setBusy(true);
    setErr("");
    try {
      const r = await submitAttempt(videoId, kind, content, answers);
      setResult(r);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] grid place-items-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-[24px] bg-white p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
            {content.title || (kind === "exam" ? x.examT : x.assignT)}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 flex-none place-items-center rounded-full bg-neutral-100">
            ✕
          </button>
        </div>

        {loading ? (
          <p className="mt-4 text-sm" style={{ color: "var(--muted)" }}>…</p>
        ) : result && !reviewing ? (
          <div className="mt-4 grid gap-3">
            <div className="rounded-2xl p-5 text-center" style={{ background: "var(--surface)" }}>
              <p className="text-3xl font-bold" dir="ltr" style={{ fontFamily: "var(--font-display)", fontVariantNumeric: "tabular-nums" }}>
                {result.choice_score}/{result.choice_total}
              </p>
              <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>{x.choiceScore}</p>
            </div>
            {result.writing_total > 0 && (
              result.status === "graded" ? (
                <p className="rounded-2xl p-4 text-center text-sm font-bold" style={{ background: "var(--teal-soft)", color: "var(--kt-deep)" }}>
                  {x.writingDone}: <span dir="ltr">{result.writing_score ?? 0}/{result.writing_total}</span>
                </p>
              ) : (
                <p className="rounded-2xl p-4 text-center text-sm font-bold" style={{ background: "#FEF3E2", color: "#9A6B1B" }}>
                  {x.writingPending}
                </p>
              )
            )}
            {result.status === "pending" && result.writing_total === 0 && (
              <p className="text-sm" style={{ color: "var(--muted)" }}>{x.writingPending}</p>
            )}
            <button
              type="button"
              onClick={() => setReviewing(true)}
              className="btn btn-secondary w-full"
            >
              {x.reviewBtn}
            </button>
          </div>
        ) : null}
        {result && reviewing && (
          <div className="mt-4 grid gap-5">
            <button
              type="button"
              onClick={() => setReviewing(false)}
              className="self-start text-sm font-bold"
              style={{ color: "var(--accent)" }}
            >
              ← {x.backToResult}
            </button>
            {content.questions.map((q, qi) => {
              const ans = result?.answers[q.id];
              const note = result?.feedback?.[q.id];
              if (q.kind === "choice") {
                const correct = q.correct;
                const picked = typeof ans === "number" ? ans : -1;
                const right = picked === correct;
                return (
                  <div key={q.id}>
                    <p className="font-bold">
                      <span dir="ltr" className="me-2" style={{ color: "var(--muted)" }}>{qi + 1}.</span>
                      {q.prompt}
                      <span
                        className="ms-2 rounded-full px-2.5 py-0.5 text-xs font-bold"
                        style={right
                          ? { background: "var(--teal-soft)", color: "var(--kt-deep)" }
                          : { background: "#FDECEA", color: "#B3261E" }}
                      >
                        {right ? x.rightMark : x.wrongMark}
                      </span>
                    </p>
                    <div className="mt-2 grid gap-2">
                      {q.choices.map((c, ci) => {
                        const isCorrect = ci === correct;
                        const isPicked = ci === picked;
                        return (
                          <div
                            key={ci}
                            className="flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm"
                            style={{
                              borderColor: isCorrect ? "var(--kt-teal)" : isPicked ? "#B3261E" : "var(--kt-line)",
                              background: isCorrect ? "var(--teal-soft)" : isPicked ? "#FDECEA" : undefined,
                            }}
                          >
                            <span className="font-bold" dir="ltr">
                              {isCorrect ? "✓" : isPicked ? "✕" : "·"}
                            </span>
                            <span>{c || "—"}</span>
                          </div>
                        );
                      })}
                    </div>
                    {note && (
                      <p className="mt-2 rounded-xl p-3 text-sm" style={{ background: "var(--surface)" }}>
                        <strong>{x.instructorNote}: </strong>
                        <span dir="auto">{note}</span>
                      </p>
                    )}
                  </div>
                );
              }
              return (
                <div key={q.id}>
                  <p className="font-bold">
                    <span dir="ltr" className="me-2" style={{ color: "var(--muted)" }}>{qi + 1}.</span>
                    {q.prompt}
                  </p>
                  <p className="mt-2 rounded-xl p-3 text-sm" dir="auto" style={{ background: "var(--surface)" }}>
                    {typeof ans === "string" && ans !== "" ? ans : "—"}
                  </p>
                  {note && (
                    <p className="mt-2 rounded-xl p-3 text-sm" style={{ background: "#FEF3E2" }}>
                      <strong>{x.instructorNote}: </strong>
                      <span dir="auto">{note}</span>
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {!result && (
          <div className="mt-4 grid gap-5">
            {content.questions.map((q, qi) => (
              <div key={q.id}>
                <p className="font-bold">
                  <span dir="ltr" className="me-2" style={{ color: "var(--muted)" }}>{qi + 1}.</span>
                  {q.prompt}
                </p>
                {q.kind === "choice" ? (
                  <div className="mt-2 grid gap-2">
                    {q.choices.map((c, ci) => (
                      <label
                        key={ci}
                        className="flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-2.5 text-sm"
                        style={{ borderColor: answers[q.id] === ci ? "var(--accent)" : "var(--kt-line)" }}
                      >
                        <input
                          type="radio"
                          name={q.id}
                          checked={answers[q.id] === ci}
                          onChange={() => setAnswers((a) => ({ ...a, [q.id]: ci }))}
                          className="h-4 w-4 accent-[#6E4E9C]"
                        />
                        <span>{c || `—`}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <textarea
                    value={typeof answers[q.id] === "string" ? (answers[q.id] as string) : ""}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                    rows={4}
                    placeholder={x.writePh}
                    className="mt-2 w-full rounded-2xl border bg-white px-4 py-3 text-sm"
                    style={{ borderColor: "var(--kt-line)" }}
                  />
                )}
              </div>
            ))}
            {err !== "" && (
              <p role="alert" className="text-sm font-bold" style={{ color: "#B3261E" }}>{err}</p>
            )}
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy}
              className="btn btn-primary w-full disabled:opacity-60"
            >
              {x.submitBtn}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
