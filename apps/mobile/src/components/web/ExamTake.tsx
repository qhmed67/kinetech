/* Web ExamTake port (apps/web/src/components/ExamTake.tsx) — take-flow for
 * one lesson exam/assignment rendered in a Modal. Questions, scoring, and
 * review marks all come from the server — the answer key never reaches the
 * client (review reveals correct options only for graded/final attempts). */

import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, TextInput, View } from "react-native";
import { useLang } from "../../lang";
import {
  emptyExam,
  getMyResult,
  submitAttempt,
  type AttemptReview,
  type ExamContent,
  type ExamKind,
  type ExamResult,
} from "../../lib/db/exams";
import { palette } from "../../theme";
import { Txt } from "../Txt";
import { Button } from "@kinetech/ui-native";

export function ExamTake({
  videoId,
  kind,
  onClose,
  startInReview,
}: {
  videoId: string;
  kind: ExamKind;
  onClose: () => void;
  startInReview?: boolean;
}) {
  const { t } = useLang();
  const x = t.exam;
  const [content, setContent] = useState<ExamContent>(emptyExam());
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<ExamResult | null>(null);
  const [review, setReview] = useState<AttemptReview[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(startInReview ?? false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void getMyResult(videoId, kind)
      .then((a) => {
        if (!alive || !a) return;
        setContent(a.questions);
        if (a.result) {
          setResult(a.result);
          setAnswers(a.result.answers ?? {});
        }
        setReview(a.review);
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
      const r = await submitAttempt(videoId, kind, answers);
      setResult(r.result);
      setReview(r.review);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose} visible>
      {/* RN has no "dialog" accessibility role (Android throws "Invalid
          accessibility role value") — the modal is announced via its label. */}
      <View style={styles.overlay} accessibilityViewIsModal>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.panel}>
          <View style={styles.head}>
            <Txt variant="h3" style={{ flexShrink: 1 }}>
              {content.title || (kind === "exam" ? x.examT : x.assignT)}
            </Txt>
            <Pressable onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close">
              <Txt variant="small">✕</Txt>
            </Pressable>
          </View>

          {loading ? (
            <Txt variant="small" tone="muted" style={{ marginTop: 16 }}>
              …
            </Txt>
          ) : result && !reviewing ? (
            <View style={{ marginTop: 16, gap: 12 }}>
              <View style={styles.scoreBox}>
                <Txt variant="h1" style={{ fontVariant: ["tabular-nums"], color: palette.fg }}>
                  {result.choice_score}/{result.choice_total}
                </Txt>
                <Txt variant="small" tone="muted" style={{ marginTop: 4 }}>
                  {x.choiceScore}
                </Txt>
              </View>
              {result.writing_total > 0 &&
                (result.status === "graded" ? (
                  <Txt variant="small" style={styles.tealNote}>
                    {x.writingDone}: {result.writing_score ?? 0}/{result.writing_total}
                  </Txt>
                ) : (
                  <Txt variant="small" style={styles.warnNote}>
                    {x.writingPending}
                  </Txt>
                ))}
              {result.status === "pending" && result.writing_total === 0 && (
                <Txt variant="small" tone="muted">
                  {x.writingPending}
                </Txt>
              )}
              <Button title={x.reviewBtn} variant="secondary" onPress={() => setReviewing(true)} />
            </View>
          ) : null}

          {result && reviewing && (
            <View style={{ marginTop: 16, gap: 20 }}>
              <Pressable onPress={() => setReviewing(false)}>
                <Txt variant="small" tone="accent" style={{ fontWeight: "700" }}>
                  ← {x.backToResult}
                </Txt>
              </Pressable>
              {content.questions.map((q, qi) => {
                const ans = result?.answers[q.id];
                const note = result?.feedback?.[q.id];
                const rev = review?.find((r) => r.id === q.id);
                if (q.kind === "choice") {
                  const picked = typeof ans === "number" ? ans : -1;
                  const correctIndex = rev?.correctIndex ?? null;
                  const right = rev?.right ?? null;
                  return (
                    <View key={q.id}>
                      <Txt variant="body" style={{ fontWeight: "700" }}>
                        {`${qi + 1}. ${q.prompt}`}
                        {right !== null ? `  ${right ? x.rightMark : x.wrongMark}` : ""}
                      </Txt>
                      <View style={{ marginTop: 8, gap: 8 }}>
                        {q.choices.map((c, ci) => {
                          const isCorrect = correctIndex !== null && ci === correctIndex;
                          const isPicked = ci === picked;
                          return (
                            <View
                              key={ci}
                              style={[
                                styles.choiceRow,
                                {
                                  borderColor: isCorrect
                                    ? palette.teal
                                    : isPicked
                                      ? palette.err
                                      : palette.line,
                                  backgroundColor: isCorrect
                                    ? "rgba(59,188,217,0.16)"
                                    : isPicked
                                      ? "#FDECEA"
                                      : "transparent",
                                },
                              ]}
                            >
                              <Txt variant="small" style={{ fontWeight: "700" }}>
                                {isCorrect ? "✓" : isPicked ? "✕" : "·"}
                              </Txt>
                              <Txt variant="small">{c || "—"}</Txt>
                            </View>
                          );
                        })}
                      </View>
                      {!!note && (
                        <Txt variant="small" style={styles.noteBox}>
                          {x.instructorNote}: {note}
                        </Txt>
                      )}
                    </View>
                  );
                }
                return (
                  <View key={q.id}>
                    <Txt variant="body" style={{ fontWeight: "700" }}>
                      {`${qi + 1}. ${q.prompt}`}
                    </Txt>
                    <Txt variant="small" style={[styles.noteBox, { marginTop: 8 }]}>
                      {typeof ans === "string" && ans !== "" ? ans : "—"}
                    </Txt>
                    {!!note && (
                      <Txt variant="small" style={[styles.warnNote, { marginTop: 8 }]}>
                        {x.instructorNote}: {note}
                      </Txt>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {!result && (
            <View style={{ marginTop: 16, gap: 20 }}>
              {content.questions.map((q, qi) => (
                <View key={q.id}>
                  <Txt variant="body" style={{ fontWeight: "700" }}>
                    {`${qi + 1}. ${q.prompt}`}
                  </Txt>
                  {q.kind === "choice" ? (
                    <View style={{ marginTop: 8, gap: 8 }}>
                      {q.choices.map((c, ci) => (
                        <Pressable
                          key={ci}
                          onPress={() => setAnswers((a) => ({ ...a, [q.id]: ci }))}
                          style={[
                            styles.choiceRow,
                            { borderColor: answers[q.id] === ci ? palette.accent : palette.line },
                          ]}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: answers[q.id] === ci }}
                        >
                          <View
                            style={[
                              styles.radio,
                              answers[q.id] === ci && { borderColor: palette.accent },
                            ]}
                          >
                            {answers[q.id] === ci && <View style={styles.radioDot} />}
                          </View>
                          <Txt variant="small">{c || "—"}</Txt>
                        </Pressable>
                      ))}
                    </View>
                  ) : (
                    <TextInput
                      value={typeof answers[q.id] === "string" ? (answers[q.id] as string) : ""}
                      onChangeText={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
                      multiline
                      numberOfLines={4}
                      placeholder={x.writePh}
                      style={styles.writing}
                      placeholderTextColor="#9aa0aa"
                    />
                  )}
                </View>
              ))}
              {err !== "" && (
                <Txt variant="small" style={{ color: palette.err, fontWeight: "700" }}>
                  {err}
                </Txt>
              )}
              <Button title={x.submitBtn} variant="primary" onPress={() => void submit()} disabled={busy} loading={busy} />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  panel: {
    width: "100%",
    maxWidth: 640,
    maxHeight: "88%",
    borderRadius: 24,
    backgroundColor: palette.white,
    padding: 24,
    overflow: "hidden",
    // Long exam forms scroll with the parent ScrollView in screens; panel
    // content is capped at 88% and wraps naturally.
  },
  head: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: "#f5f5f5",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  scoreBox: {
    borderRadius: 16,
    backgroundColor: palette.surface,
    padding: 20,
    alignItems: "center",
  },
  tealNote: {
    borderRadius: 16,
    padding: 16,
    textAlign: "center",
    backgroundColor: "rgba(59,188,217,0.16)",
    color: palette.deep,
    fontWeight: "700",
  },
  warnNote: {
    borderRadius: 16,
    padding: 16,
    textAlign: "center",
    backgroundColor: "#FEF3E2",
    color: "#9A6B1B",
    fontWeight: "700",
  },
  choiceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  radio: {
    width: 16,
    height: 16,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: palette.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: palette.accent,
  },
  writing: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 16,
    backgroundColor: palette.white,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    minHeight: 96,
    textAlignVertical: "top",
  },
  noteBox: {
    borderRadius: 12,
    padding: 12,
    backgroundColor: palette.surface,
  },
});
