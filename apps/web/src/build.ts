/* Build stamp: proves which bundle is actually running (Vercel age check).
   __BUILD_HASH__ is injected at build time from git HEAD (vite.config.ts);
   unknown in dev/test. Quote it in every bug report. */

declare const __BUILD_HASH__: string | undefined;

export const BUILD_HASH: string =
  typeof __BUILD_HASH__ !== "undefined" && __BUILD_HASH__ ? __BUILD_HASH__ : "dev";
