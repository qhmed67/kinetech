import { useState } from "react";
import { useLang } from "../components/lang";
import { Field, Text } from "./ui";
import { apiFetch } from "../lib/http";
import { getAccessToken } from "../lib/accessToken";
import { extractDriveFileId, extractYoutubeVideoId } from "../lib/driveLinks";

type Meta = {
  ok?: boolean;
  mimeType?: string;
  size?: number | null;
  isMp4?: boolean;
  faststart?: boolean | null;
  warning?: string;
  code?: string;
  ar?: string;
  en?: string;
};

/**
 * Explicit stream ids for the Worker-streamed player.
 *
 * The Drive file id is derived from the video link the admin already pastes
 * (all common Drive link forms are accepted); the optional YouTube id is the
 * last-resort fallback. "Validate file" asks the admin-only endpoint for the
 * MIME type / size / faststart hint — a WARNING for the admin, never a block:
 * the player still falls back to Direct / YouTube if the stream is
 * unavailable.
 */
export function VideoStreamFields({
  src,
  youtubeId,
  onYoutubeId,
}: {
  src: string;
  youtubeId: string;
  onYoutubeId: (value: string) => void;
}) {
  const { lang, t } = useLang();
  const a = t.admin;
  const driveId = extractDriveFileId(src) ?? "";
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState("");

  const validate = async () => {
    if (driveId === "" || state === "loading") return;
    setState("loading");
    setMeta(null);
    setError("");
    const token = await getAccessToken();
    if (!token) {
      setState("error");
      setError(a.vidSession);
      return;
    }
    try {
      const r = await apiFetch("/api/admin/video-meta", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ fileId: driveId }),
      });
      const body = (await r.json().catch(() => null)) as Meta | null;
      if (!r.ok || !body || body.ok !== true) {
        setState("error");
        setError((lang === "ar" ? body?.ar : body?.en) || a.vidValidateFail);
        return;
      }
      setMeta(body);
      setState("done");
    } catch {
      setState("error");
      setError(a.vidValidateFail);
    }
  };

  const sizeMb =
    meta && typeof meta.size === "number" && Number.isFinite(meta.size)
      ? `${(meta.size / (1024 * 1024)).toFixed(1)} MB`
      : "";

  const verdict = (() => {
    if (!meta) return null;
    if (!meta.isMp4) return { tone: "warn" as const, text: a.vidNotMp4 };
    if (meta.faststart === false) return { tone: "warn" as const, text: a.vidNotFaststart };
    if (meta.faststart === null) return { tone: "info" as const, text: a.vidFaststartUnknown };
    return { tone: "ok" as const, text: a.vidOk };
  })();

  const toneColor = (tone: "ok" | "warn" | "info") =>
    tone === "ok" ? "var(--accent)" : tone === "warn" ? "#B3261E" : "var(--muted)";

  return (
    <div className="grid gap-3 rounded-2xl border p-4" style={{ borderColor: "var(--border)" }}>
      <p className="text-[11px] font-bold" style={{ color: "var(--muted)" }}>{a.vidPlaybackOrder}</p>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[13px] font-bold" style={{ color: driveId ? "var(--accent)" : "var(--muted)" }}>
          {driveId ? `${a.vidDriveDetected} ✓` : a.vidDriveMissing}
        </p>
        {driveId && (
          <button
            type="button"
            onClick={() => void validate()}
            disabled={state === "loading"}
            className="btn btn-ghost text-[13px]"
          >
            {state === "loading" ? a.vidValidating : a.vidValidate}
          </button>
        )}
      </div>

      {verdict && (
        <p className="text-xs font-bold" role="status" style={{ color: toneColor(verdict.tone) }}>
          {[meta?.mimeType, sizeMb, verdict.text].filter(Boolean).join(" · ")}
        </p>
      )}
      {state === "error" && (
        <p className="text-xs font-bold" role="alert" style={{ color: "#B3261E" }}>
          {error}
        </p>
      )}

      <Field label={a.vidYtFallback}>
        <div className="grid gap-2">
          <Text
            value={youtubeId}
            dir="ltr"
            placeholder={a.vidYtFallbackPh}
            onChange={(e) => onYoutubeId(extractYoutubeVideoId(e.target.value) ?? e.target.value.trim())}
          />
        </div>
      </Field>
    </div>
  );
}
