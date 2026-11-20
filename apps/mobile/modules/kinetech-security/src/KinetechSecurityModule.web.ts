import { registerWebModule, NativeModule } from 'expo';

import {
  EnvironmentRisk,
  KinetechSecurityModuleEvents,
} from './KinetechSecurity.types';

/** The native shell never runs on the web — safe defaults only. */
class KinetechSecurityModule extends NativeModule<KinetechSecurityModuleEvents> {
  async getEnvironmentRisk(): Promise<EnvironmentRisk> {
    return {
      root: false,
      emulator: false,
      adb: false,
      jailbreak: false,
      simulator: false,
      screenCapture: false,
      externalDisplay: false,
    };
  }

  async isScreenCaptured(): Promise<boolean> {
    return false;
  }
}

export default registerWebModule(KinetechSecurityModule, 'KinetechSecurity');
