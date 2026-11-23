/* Native app version gate — WEB side (Task 2).
 *
 * The blocking "update required" screen lives HERE (the web layer) on
 * purpose: the native shell loads this web app from Vercel, so an OLD shell
 * still renders the NEW blocking screen. A native-only screen would have
 * needed a new app build to exist before it could block anything.
 *
 * Lockout safety:
 *   - An unknown client version NEVER blocks (installed shells that predate
 *     this feature send no version at all).
 *   - If /api/app-config cannot be reached, nothing blocks (fail-open).
 *   - The kill switch (native_gate.gate_enabled) turns the whole gate off.
 *
 * The server is the second line of defence: POST /api/play answers 426
 * (APP_001) for an outdated native client. This module turns that into the
 * same screen.
 */

import { nativeAppVersion } from "../native";
import { compareSemver } from "./semver";

export type NativeGate = {
  /** Master switch: false disables the whole gate. */
  gate_enabled: boolean;
  /** Lowest supported native app version (semver). */
  min_supported_version: string;
  /** When true an outdated app is blocked; when false it is only warned. */
  force_update: boolean;
  message_ar: string;
  message_en: string;
};

export const DEFAULT_GATE: NativeGate = {
  gate_enabled: true,
  min_supported_version: "0.0.0",
  force_update: false,
  message_ar: "",
  message_en: "",
};

/** Fired when a 426 / APP_001 answer arrives from /api/play. */
export const UPDATE_REQUIRED_EVENT = "kt:app-update-required";

export type UpdateRequiredDetail = {
  ar?: string;
  en?: string;
  minSupportedVersion?: string;
};

/** Broadcast "block the app" to whatever renders the screen. */
export function notifyUpdateRequired(detail: UpdateRequiredDetail = {}): void {
  try {
    window.dispatchEvent(new CustomEvent(UPDATE_REQUIRED_EVENT, { detail }));
  } catch {
    /* never break the player because of a notice */
  }
}

/**
 * Read the public gate config.
 * Returns null when the endpoint is unreachable or answers garbage —
 * the caller MUST treat null as "do not block" (fail-open).
 */
export async function fetchAppGate(): Promise<NativeGate | null> {
  try {
    const res = await fetch("/api/app-config", {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as { ok?: boolean; native_gate?: unknown } | null;
    if (!body || body.ok !== true) return null;
    const gate = body.native_gate;
    if (!gate || typeof gate !== "object") return null;
    const g = gate as Record<string, unknown>;
    return {
      gate_enabled: typeof g.gate_enabled === "boolean" ? g.gate_enabled : DEFAULT_GATE.gate_enabled,
      min_supported_version:
        typeof g.min_supported_version === "string" ? g.min_supported_version : DEFAULT_GATE.min_supported_version,
      force_update: typeof g.force_update === "boolean" ? g.force_update : DEFAULT_GATE.force_update,
      message_ar: typeof g.message_ar === "string" ? g.message_ar : DEFAULT_GATE.message_ar,
      message_en: typeof g.message_en === "string" ? g.message_en : DEFAULT_GATE.message_en,
    };
  } catch {
    return null;
  }
}

/**
 * True when THIS client must be blocked.
 *
 * Rules (lockout safe):
 *   - no version reported  -> never block
 *   - gate disabled         -> never block
 *   - force_update false    -> never block (warn only)
 *   - unparsable version    -> never block
 */
export function isUpdateRequired(gate: NativeGate | null, version: string): boolean {
  if (!gate) return false;
  if (!gate.gate_enabled) return false;
  if (!gate.force_update) return false;
  const client = String(version || "").trim();
  if (client === "") return false;
  const cmp = compareSemver(client, gate.min_supported_version);
  if (cmp === null) return false;
  return cmp < 0;
}

/** The version this shell reports (empty in a browser or an old shell). */
export function clientAppVersion(): string {
  return nativeAppVersion();
}
