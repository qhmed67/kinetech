/* Blocking "update required" screen — WEB LAYER (Task 2).
 *
 * This screen is hosted on Vercel together with the rest of the web app, so
 * an OLD native shell still renders the NEW screen: the shell loads this web
 * app over HTTPS. A screen inside the native binary would have needed a new
 * app build before it could block anything.
 *
 * It shows when:
 *   - GET /api/app-config reports this client version below the minimum and
 *     force_update is on, or
 *   - POST /api/play answered 426 / APP_001 (broadcast by the player).
 *
 * It NEVER shows when the client version is unknown, when the gate is off,
 * or when /api/app-config is unreachable (fail-open).
 */

import { useEffect, useState } from "react";
import { useLang } from "./lang";
import {
  UPDATE_REQUIRED_EVENT,
  clientAppVersion,
  fetchAppGate,
  isUpdateRequired,
  type NativeGate,
  type UpdateRequiredDetail,
} from "../lib/appGate";

export type AppUpdateRequiredProps = {
  /** Force the screen on (the parent decided to block). */
  forced?: boolean;
  /** Details from a 426 answer. */
  detail?: UpdateRequiredDetail;
  onDismiss?: () => void;
};

export function AppUpdateRequired({ forced, detail, onDismiss }: AppUpdateRequiredProps) {
  const { lang, t } = useLang();
  const [gate, setGate] = useState<NativeGate | null>(null);
  const [blocked, setBlocked] = useState<boolean>(forced === true);
  const version = clientAppVersion();

  // Event-driven block (426 / APP_001 from /api/play).
  useEffect(() => {
    const onEvent = (event: Event) => {
      const d = (event as CustomEvent<UpdateRequiredDetail>).detail;
      setBlocked(true);
      if (d && typeof d === "object") {
        setGate((g) =>
          g
            ? { ...g, message_ar: d.ar || g.message_ar, message_en: d.en || g.message_en, min_supported_version: d.minSupportedVersion || g.min_supported_version }
            : null,
        );
      }
    };
    window.addEventListener(UPDATE_REQUIRED_EVENT, onEvent);
    return () => window.removeEventListener(UPDATE_REQUIRED_EVENT, onEvent);
  }, []);

  // Config-driven block. Fail-open: an unreachable /api/app-config blocks
  // nobody.
  useEffect(() => {
    let alive = true;
    void fetchAppGate().then((g) => {
      if (!alive) return;
      setGate(g);
      if (isUpdateRequired(g, version)) setBlocked(true);
    });
    return () => {
      alive = false;
    };
  }, [version]);

  if (!blocked) return null;

  const ar = gate?.message_ar?.trim() || detail?.ar?.trim() || "";
  const en = gate?.message_en?.trim() || detail?.en?.trim() || "";
  const body = lang === "ar" ? ar || t.appUpdate.body : en || t.appUpdate.body;
  const minVersion =
    gate?.min_supported_version?.trim() || detail?.minSupportedVersion?.trim() || "";

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="kt-app-update-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "var(--bg, #FFFFFF)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 520, width: "100%", textAlign: "center" }}>
        <h1
          id="kt-app-update-title"
          className="text-2xl font-bold"
          style={{ fontFamily: "var(--font-display)", marginBottom: 12 }}
        >
          {t.appUpdate.title}
        </h1>
        <p style={{ color: "var(--muted)", lineHeight: 1.7, marginBottom: 16 }}>{body}</p>

        <div
          className="grid gap-1 text-sm"
          style={{ color: "var(--muted)", marginBottom: 20 }}
        >
          <p>
            <strong>{t.appUpdate.version}:</strong> {version || t.appUpdate.unknownVersion}
          </p>
          {minVersion !== "" && (
            <p>
              <strong>{t.appUpdate.minVersion}:</strong> {minVersion}
            </p>
          )}
        </div>

        <h2 className="text-lg font-bold" style={{ marginBottom: 8 }}>
          {t.appUpdate.cta}
        </h2>
        <p style={{ color: "var(--muted)", lineHeight: 1.7, marginBottom: 16 }}>
          {t.appUpdate.ctaBody}
        </p>

        <div className="flex flex-wrap gap-3" style={{ justifyContent: "center" }}>
          <a
            className="rounded-full px-5 py-2.5 text-sm font-bold"
            style={{ background: "var(--accent)", color: "#fff", border: "1px solid var(--accent)" }}
            href="https://play.google.com/store/apps/details?id=com.kinetech.mobile"
            target="_blank"
            rel="noreferrer"
          >
            {t.appUpdate.store}
          </a>
          <a
            className="rounded-full border px-5 py-2.5 text-sm font-bold"
            style={{ background: "#fff", color: "var(--muted)", borderColor: "var(--border)" }}
            href="https://apps.apple.com/app/id0000000000"
            target="_blank"
            rel="noreferrer"
          >
            {t.appUpdate.storeIos}
          </a>
        </div>

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="mt-6 text-sm underline"
            style={{ color: "var(--muted)" }}
          >
            {t.misc.home}
          </button>
        )}
      </div>
    </div>
  );
}
