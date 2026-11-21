import { NativeModule, requireOptionalNativeModule } from 'expo';

import {
  EnvironmentRisk,
  KinetechSecurityModuleEvents,
} from './KinetechSecurity.types';

declare class KinetechSecurityModule extends NativeModule<KinetechSecurityModuleEvents> {
  /** Booleans only — no paths, no ids, no user data crosses the bridge. */
  getEnvironmentRisk(): Promise<EnvironmentRisk>;
  /** iOS: UIScreen.isCaptured. Android: false (FLAG_SECURE blocks capture). */
  isScreenCaptured(): Promise<boolean>;
}

const SAFE_RISK: EnvironmentRisk = {
  root: false,
  emulator: false,
  adb: false,
  jailbreak: false,
  simulator: false,
  screenCapture: false,
  externalDisplay: false,
};

/** Expo Go and builds without the native binary: checks are unavailable, so
 *  report safe defaults. Playback is still gated by the server. */
const fallback = {
  async getEnvironmentRisk(): Promise<EnvironmentRisk> {
    return { ...SAFE_RISK };
  },
  async isScreenCaptured(): Promise<boolean> {
    return false;
  },
  addListener(): { remove(): void } {
    return { remove() {} };
  },
};

export default (requireOptionalNativeModule<KinetechSecurityModule>(
  'KinetechSecurity',
) ?? (fallback as unknown as KinetechSecurityModule));
