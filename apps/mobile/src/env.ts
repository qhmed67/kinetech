/* Public environment values for the native shell.
 * EXPO_PUBLIC_* variables are inlined by the bundler — they are public by
 * definition (the Supabase anon key, the API base URL). Secrets never live
 * here. */

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || "https://kinetechtest.vercel.app";

export const ENV = {
  API_BASE_URL,
} as const;
