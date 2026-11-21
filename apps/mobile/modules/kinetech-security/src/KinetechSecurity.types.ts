/** Result of the on-device environment checks (2027-architecture.md §2.4).
 *
 * These checks only raise the cost of copying. A determined attacker can
 * bypass them; none of them is DRM and none of them proves a safe device.
 */
export type EnvironmentRisk = {
  root: boolean;
  emulator: boolean;
  adb: boolean;
  jailbreak: boolean;
  simulator: boolean;
  screenCapture: boolean;
  externalDisplay: boolean;
};

export type CaptureChangeEvent = {
  captured: boolean;
};

export type KinetechSecurityModuleEvents = {
  onCaptureChange: (event: CaptureChangeEvent) => void;
};
