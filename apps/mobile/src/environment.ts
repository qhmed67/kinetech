/* Device environment wrapper for the native security module.
 *
 * Native checks are best-effort: if the module is missing (Expo Go) or throws,
 * we return safe defaults rather than blocking the app. Playback still goes
 * through the server gate, so a missed check does not grant access.
 */

import SecurityModule, { type EnvironmentRisk } from "../modules/kinetech-security";

export type { EnvironmentRisk };

const SAFE: EnvironmentRisk = {
  root: false,
  emulator: false,
  adb: false,
  jailbreak: false,
  simulator: false,
  screenCapture: false,
  externalDisplay: false,
};

/** The native checks, or all-false when this build has no native module. */
export async function getEnvironmentRisk(): Promise<EnvironmentRisk> {
  try {
    const raw = await SecurityModule.getEnvironmentRisk();
    if (!raw || typeof raw !== "object") return SAFE;
    return {
      root: raw.root === true,
      emulator: raw.emulator === true,
      adb: raw.adb === true,
      jailbreak: raw.jailbreak === true,
      simulator: raw.simulator === true,
      screenCapture: raw.screenCapture === true,
      externalDisplay: raw.externalDisplay === true,
    };
  } catch {
    return SAFE;
  }
}

/** True when a screen recording / mirroring session is active right now. */
export async function isScreenCaptured(): Promise<boolean> {
  try {
    return (await SecurityModule.isScreenCaptured()) === true;
  } catch {
    return false;
  }
}

/** Subscribe to capture changes. Returns an unsubscribe function. */
export function onCaptureChange(handler: (captured: boolean) => void): () => void {
  try {
    const subscription = SecurityModule.addListener("onCaptureChange", (event) =>
      handler(event.captured === true),
    );
    return () => {
      try {
        subscription.remove();
      } catch {
        /* listener cleanup must never throw */
      }
    };
  } catch {
    return () => {};
  }
}

/** Human-readable reason keys, for the Blocked screen and the web status. */
export function riskReasons(risk: EnvironmentRisk): string[] {
  const reasons: string[] = [];
  if (risk.root) reasons.push("root");
  if (risk.jailbreak) reasons.push("jailbreak");
  if (risk.emulator) reasons.push("emulator");
  if (risk.simulator) reasons.push("simulator");
  if (risk.adb) reasons.push("adb");
  if (risk.externalDisplay) reasons.push("externalDisplay");
  return reasons;
}
