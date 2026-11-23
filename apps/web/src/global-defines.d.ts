/** Build-time constants injected by vite.config.ts `define`.
 *  Declared globally so code can compare them at build time (which is what
 *  lets the minifier delete production-dead branches and any secret inside). */
declare const __BUILD_HASH__: string | undefined;
declare const __APP_ENV__: string | undefined;
declare const __DRIVE_TEST_KEY__: string | undefined;
