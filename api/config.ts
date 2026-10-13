// Canonical playback-guard thresholds + error catalog for POST /api/play
// and POST /api/session-register.
//
// SINGLE SOURCE for the TypeScript side. The Postgres function
// request_play() carries the same numbers as parameter DEFAULTS — change
// both together (see supabase/migrations/20261032_play_security_core.sql).
// Every error below is bilingual (AR first in UI) with an explicit code the
// client switches on (not on message text).

export const PLAY = {
  /** R1: max play requests per window before 429. */
  r1Max: 5,
  /** R1 window, seconds. */
  r1Secs: 30,
  /** R2: distinct-minutes sum over trailing window that only FLAGS. */
  r2Warn: 120,
  /** R2: distinct-minutes sum that DENIES. */
  r2Deny: 240,
  /** R2 trailing window, minutes. */
  r2Mins: 60,
  /** R3: distinct IPs in 24h that only FLAGS (mobile networks rotate). */
  r3Max: 3,
  /** Repeat window: same video+session inside this many minutes never burns. */
  repeatMins: 30,
} as const;

export type PlayErrorCode =
  | "INVALID_TOKEN"
  | "SESSION_MISMATCH"
  | "BANNED"
  | "NOT_ENROLLED"
  | "VIEW_CAP"
  | "RATE_LIMITED"
  | "SUSPICIOUS_DENY"
  | "NOT_FOUND"
  | "VIDEO_MISSING"
  | "NO_PROFILE"
  | "BAD_REQUEST"
  | "SERVER_ERROR"
  | "METHOD_NOT_ALLOWED";

export const PLAY_ERRORS: Record<PlayErrorCode, { status: number; ar: string; en: string }> = {
  INVALID_TOKEN: { status: 401, ar: "انتهت الجلسة — سجّل الدخول مرة أخرى.", en: "Session invalid — please sign in again." },
  SESSION_MISMATCH: { status: 401, ar: "تم تسجيل الدخول من جهاز آخر. تم تسجيل خروج هذا الجهاز.", en: "Signed in on another device. This device has been signed out." },
  BANNED: { status: 403, ar: "تم إيقاف هذا الحساب. تواصل مع الدعم.", en: "This account is suspended. Contact support." },
  NOT_ENROLLED: { status: 403, ar: "غير مسجل في هذا الكورس.", en: "Not enrolled in this course." },
  VIEW_CAP: { status: 403, ar: "وصلت للحد الأقصى للمشاهدات (3).", en: "Viewing limit reached (3 views)." },
  RATE_LIMITED: { status: 429, ar: "طلبات كثيرة جدًا — انتظر قليلًا وحاول مجددًا.", en: "Too many requests — wait a moment and retry." },
  SUSPICIOUS_DENY: { status: 403, ar: "تم رفض التشغيل لنشاط غير معتاد. تواصل مع الدعم.", en: "Playback denied for unusual activity. Contact support." },
  NOT_FOUND: { status: 404, ar: "الفيديو غير موجود.", en: "Video not found." },
  VIDEO_MISSING: { status: 404, ar: "ملف الفيديو غير مرفق بعد.", en: "Video file not attached yet." },
  NO_PROFILE: { status: 403, ar: "الحساب غير مكتمل. تواصل مع الدعم.", en: "Account incomplete. Contact support." },
  BAD_REQUEST: { status: 400, ar: "طلب غير صالح.", en: "Bad request." },
  SERVER_ERROR: { status: 500, ar: "خطأ في الخادم — حاول مجددًا.", en: "Server error — please retry." },
  METHOD_NOT_ALLOWED: { status: 405, ar: "طريقة غير مسموحة.", en: "Method not allowed." },
};
