-- ============ video_sources.source — where a lesson's media lives ============
-- Additive only. Existing rows keep working: the default is 'drive', which
-- is the current behaviour (a Drive link, played inside Google's own frame).
--
-- 'r2'   → the lesson lives in the private Cloudflare R2 bucket and is
--           served through the Cloudflare Worker (encrypted HLS, short-lived
--           playback token).
-- 'drive' → the lesson is a Drive file (fallback).
--
-- The server also understands a marker in src_url ("r2:<lessonId>"), so the
-- app works before this migration is applied.

alter table video_sources
  add column if not exists source text not null default 'drive';

-- Keep the marker in sync for rows that point at R2 (the app reads either).
update video_sources
   set source = 'r2'
 where lower(btrim(src_url)) like 'r2:%'
   and source = 'drive';

-- Nothing else changes: the gate (enrolment, view cap, rate limits, single
-- session) is untouched, and no media URL ever moves to the client.
