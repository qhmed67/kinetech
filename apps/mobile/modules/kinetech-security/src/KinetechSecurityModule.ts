import { NativeModule, requireNativeModule } from 'expo';

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

export default requireNativeModule<KinetechSecurityModule>('KinetechSecurity');
