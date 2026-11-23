/** Build-time environment label: "production" | "preview" | "development".
 *
 * Injected by vite.config.ts (`__APP_ENV__`). Preview and development builds
 * keep dev-only surfaces; a production build must never ship them — nor any
 * credential they use.
 */
declare const __APP_ENV__: string | undefined;

export type AppEnv = "production" | "preview" | "development";

export function appEnv(): AppEnv {
  const v = typeof __APP_ENV__ !== "undefined" && __APP_ENV__ ? __APP_ENV__ : "development";
  return v === "production" || v === "preview" ? v : "development";
}

/** True for preview/development builds only. Written so a production build's
 *  dead branches (and the secrets inside them) are eliminated. */
export function isNonProductionBuild(): boolean {
  return appEnv() !== "production";
}
