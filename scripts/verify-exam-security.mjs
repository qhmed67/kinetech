// Manual RBAC verification for the exam lockdown (phase 2).
// Run AFTER migrations 20261034+20261035 are applied:
//
//   $env:SUPABASE_URL="https://xyz.supabase.co"
//   $env:SUPABASE_ANON_KEY="<anon key, never the service key>"
//   $env:STUDENT_EMAIL="student@example.com"
//   $env:STUDENT_PASSWORD="..."
//   $env:VIDEO_ID="<a video uuid that has an exam>"
//   node scripts/verify-exam-security.mjs
//
// Expects ALL checks to FAIL CLOSED (denied/empty). Any PASS on a forbidden
// read/write means the lockdown migrations did not run (or RLS was altered).

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? "";
const anon = process.env.SUPABASE_ANON_KEY ?? "";
const email = process.env.STUDENT_EMAIL ?? "";
const password = process.env.STUDENT_PASSWORD ?? "";
const videoId = process.env.VIDEO_ID ?? "";

if (!url || !anon || !email || !password || !videoId) {
  console.error("missing env: SUPABASE_URL, SUPABASE_ANON_KEY, STUDENT_EMAIL, STUDENT_PASSWORD, VIDEO_ID");
  process.exit(2);
}

const sb = createClient(url, anon);
const { error: signErr } = await sb.auth.signInWithPassword({ email, password });
if (signErr) {
  console.error("signin failed:", signErr.message);
  process.exit(2);
}

let failures = 0;
const check = (name, blocked) => {
  console.log(`${blocked ? "PASS (blocked)" : "FAIL (allowed!)"} — ${name}`);
  if (!blocked) failures += 1;
};

// 1. exam_keys must be invisible (RLS, no policies -> zero rows).
{
  const { data, error } = await sb.from("exam_keys").select("video_id").limit(1);
  check("student cannot read exam_keys", !!error || (data ?? []).length === 0);
}

// 2. videos.exam_json must be unreadable (column revoked).
{
  const { data, error } = await sb.from("videos").select("exam_json").eq("id", videoId).limit(1);
  check("student cannot select videos.exam_json", !!error);
  void data;
}

// 3. Direct exam_results insert with forged scores must fail.
{
  const { error } = await sb.from("exam_results").insert({
    user_id: "00000000-0000-0000-0000-000000000000",
    video_id: videoId,
    kind: "exam",
    answers: {},
    choice_score: 100,
    choice_total: 100,
    status: "graded",
  });
  check("student cannot insert forged exam_results", !!error);
}

// 4. Direct exam_results update (self-grade) must fail on a real row.
//    (Skipped automatically when the student has no attempt yet.)
{
  const mine = await sb.from("exam_results").select("video_id,kind").limit(1).maybeSingle();
  if (mine.data) {
    const { error } = await sb.from("exam_results")
      .update({ writing_score: 100, status: "graded" })
      .eq("user_id", (await sb.auth.getUser()).data.user?.id ?? "")
      .eq("video_id", mine.data.video_id)
      .eq("kind", mine.data.kind);
    check("student cannot self-grade via update", !!error);
  } else {
    console.log("SKIP — no attempt row yet (submit once, then rerun for check 4)");
  }
}

// 5. get_exam RPC must return questions WITHOUT correct indices.
{
  const { data, error } = await sb.rpc("get_exam", { p_video: videoId, p_kind: "exam" });
  const text = JSON.stringify(data ?? {});
  check(
    "get_exam output carries no answer key",
    !error && !/"correct":\d/.test(text),
  );
}

await sb.auth.signOut();
if (failures > 0) {
  console.error(`${failures} check(s) ALLOWED — lockdown incomplete`);
  process.exit(1);
}
console.log("all checks blocked — lockdown holds");
