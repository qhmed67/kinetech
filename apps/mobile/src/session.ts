/* Device-bound session for the native shell (2027-architecture.md §2.6).
 *
 * The access token is handed over by the web UI over the bridge and is kept
 * in the device keystore (Android Keystore / iOS Keychain via
 * expo-secure-store) — never in plain storage, never in a log, never in the
 * WebView. The device id is generated once and stays with the app; the
 * server binds every playback grant to it.
 */

import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";

const TOKEN_KEY = "kt-session-token";
const DEVICE_KEY = "kt-device-id";

/** The device id (uuid v4). Generated once, then reused. */
export async function getDeviceId(): Promise<string> {
  try {
    const existing = await SecureStore.getItemAsync(DEVICE_KEY);
    if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing.toLowerCase();
  } catch {
    /* first run */
  }
  const id = Crypto.randomUUID();
  try {
    await SecureStore.setItemAsync(DEVICE_KEY, id);
  } catch {
    /* best-effort: the id is regenerated next launch */
  }
  return id.toLowerCase();
}

/** Store the session credential that the web handed over. */
export async function setSessionToken(token: string): Promise<void> {
  const value = token.trim();
  if (value === "") return;
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, value);
  } catch {
    /* best-effort */
  }
}

/** The stored session credential, or null when the app has no session. */
export async function getSessionToken(): Promise<string | null> {
  try {
    const value = await SecureStore.getItemAsync(TOKEN_KEY);
    return value && value.trim() !== "" ? value : null;
  } catch {
    return null;
  }
}

/** Forget the session (sign out / session killed). */
export async function clearSession(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    /* best-effort */
  }
}
