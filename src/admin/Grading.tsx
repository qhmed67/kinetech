import { useEffect, useState } from "react";
import { useLang } from "../components/lang";
import {
  gradeAttempt,
  listPendingGrading,
  type PendingGrading,
} from "../lib/db/examsDb";

/**
 * Instructor grading queue: every attempt waiting on writing review.
 * Each writing answer is marked correct/incorrect; saving flips the
 * attempt to graded and notifies the student automatically.
 */
export function Grading() {
  const { t } = useLang();
  const x = t.exam;
  const [rows, setRows] = useState<PendingGrading[] | null>(null);
  const [err, setErr] = useState("");
  const [marks, setMarks] = useState<Record<string, Record<string, boolean>>>({});
  const [busyKey, setBusyKey] = useState("");
  const [doneKey, setDoneKey] = useState("");

  const load = async () => {
    setErr("");
    try {
      setRows(await listPendingGrading());
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "error");
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const keyOf = (r: PendingGrading) => `${r.user_id}:${r.video_id}:${r.kind}`;
  const writingQs = (r: PendingGrading) =>
    (r.exam?.questions ?? []).filter((q) => q.kind === "writing");

  const save = async (r: PendingGrading) => {
    const k = keyOf(r);
    if (busyKey) return;
    setBusyKey(k);
    setErr("");
    try {
      const m: Record<string, boolean> = {};
      for (const q of writingQs(r)) m[q.id] = marks[k]?.[q.id] ?? false;
      await gradeAttempt(r.user_id, r.video_id, r.kind, m);
      setDoneKey(k);
      window.setTimeout(() => setDoneKey(""), 2500);
      await load();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "error");
    } finally {
      setBusyKey("");
    }
  };

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
        {x.gradeT}
      </h1>
      {err !== "" && (
        <p role="alert" className="text-sm font-bold" style={{ color: "#B3261E" }}>{err}</p>
      )}
      {rows === null ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>{x.noPending}</p>
      ) : (
        rows.map((r) => {
          const k = keyOf(r);
          const wqs = writingQs(r);
          return (
            <article key={k} className="grid gap-3 rounded-[20px] border bg-white p-5" style={{ borderColor: "var(--kt-line)" }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold" style={{ fontFamily: "var(--font-display)" }}>
                  <span dir="ltr">{r.email}</span>
                  <span className="ms-2 text-sm font-medium" style={{ color: "var(--muted)" }}>
                    {r.course_slug} · {r.kind === "exam" ? x.examT : x.assignT}
                  </span>
                </p>
                <p dir="ltr" className="text-sm font-bold tabular-nums" style={{ color: "var(--muted)" }}>
                  {r.choice_score}/{r.choice_total}
                </p>
              </div>
              {wqs.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--muted)" }}>—</p>
              ) : (
                wqs.map((q) => {
                  const ans = r.answers[q.id];
                  const marked = marks[k]?.[q.id] ?? false;
                  return (
                    <div key={q.id} className="rounded-2xl p-4" style={{ background: "var(--surface)" }}>
                      <p className="font-bold">{q.prompt}</p>
                      <p className="mt-1 text-sm" dir="auto" style={{ color: "var(--muted)" }}>
                        {typeof ans === "string" && ans !== "" ? ans : "—"}
                      </p>
                      <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm font-bold">
                        <input
                          type="checkbox"
                          checked={marked}
                          onChange={(e) => setMarks((m) => ({
                            ...m,
                            [k]: { ...(m[k] ?? {}), [q.id]: e.target.checked },
                          }))}
                          className="h-4 w-4 accent-[#6E4E9C]"
                        />
                        {x.markCorrect}
                      </label>
                    </div>
                  );
                })
              )}
              <div>
                <button
                  type="button"
                  onClick={() => void save(r)}
                  disabled={busyKey !== ""}
                  className="btn btn-primary disabled:opacity-60"
                  style={{ minHeight: 44 }}
                >
                  {doneKey === k ? x.gradedOk : x.saveGrade}
                </button>
              </div>
            </article>
          );
        })
      )}
    </div>
  );
}
