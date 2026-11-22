-- ============ video stream fallbacks (additive, nullable only) ============
-- Adds the explicit source ids the Worker-streamed player needs:
--   drive_file_id    the Google Drive file the Worker streams (no URL in the DB)
--   youtube_video_id the last-resort YouTube fallback for that lesson
--
-- Both columns are NULLABLE and the defaults are NULL, so every existing row
-- keeps working exactly as before (the server falls back to extracting the
-- Drive id from video_sources.src_url until an admin saves the new field).
--
-- Safe to run on a preview that shares the production database: no data is
-- rewritten, no column is dropped, no constraint is added.
--
-- WHERE TO RUN: Supabase dashboard -> SQL Editor -> paste this file -> Run.
-- Do NOT apply it from the app; the owner applies migrations.

alter table videos
  add column if not exists drive_file_id text;

alter table videos
  add column if not exists youtube_video_id text;

comment on column videos.drive_file_id is
  'Google Drive file id streamed through the kinetech-video-test Worker (null = use the legacy embed)';
comment on column videos.youtube_video_id is
  'Optional last-resort YouTube fallback id (null = no YouTube tier)';

-- ---------------------------------------------------------------------------
-- Admin-only writer. Kept as a NEW function (not a change to
-- admin_upsert_video) so the existing save path keeps working unchanged on
-- databases where this migration has not been applied yet.
-- ---------------------------------------------------------------------------
create or replace function admin_set_video_fallbacks(
  p_video uuid,
  p_drive text,
  p_youtube text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_drive text := nullif(btrim(coalesce(p_drive, '')), '');
  v_youtube text := nullif(btrim(coalesce(p_youtube, '')), '');
begin
  if not is_admin() then raise exception 'admin only'; end if;
  -- Ids are opaque Google/YouTube tokens; reject anything with URL syntax so
  -- a pasted link can never be stored in these columns.
  if v_drive is not null and v_drive !~ '^[A-Za-z0-9_-]{10,}$' then
    raise exception 'invalid drive file id';
  end if;
  if v_youtube is not null and v_youtube !~ '^[A-Za-z0-9_-]{11}$' then
    raise exception 'invalid youtube video id';
  end if;
  update videos
     set drive_file_id = v_drive,
         youtube_video_id = v_youtube
   where id = p_video;
end $$;

-- ---------------------------------------------------------------------------
-- Admin-only reader used by the course editor to hydrate the two fields.
-- Separate from admin_video_sources so its return type stays unchanged.
-- ---------------------------------------------------------------------------
create or replace function admin_video_streams(p_slug text)
returns table (
  video_id uuid,
  sort_order int,
  drive_file_id text,
  youtube_video_id text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'admin only'; end if;
  return query
    select v.id, v.sort_order, v.drive_file_id, v.youtube_video_id
      from videos v
      join courses c on c.id = v.course_id
     where c.slug = p_slug
     order by v.sort_order;
end $$;

grant execute on function admin_set_video_fallbacks(uuid, text, text) to authenticated;
grant execute on function admin_video_streams(text) to authenticated;
