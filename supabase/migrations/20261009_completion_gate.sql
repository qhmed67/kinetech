-- KineTech completion gating — run AFTER 20261008_hardening.sql
-- Closes seek-to-end bypass: dragging the seek bar to the end used to fire
-- onEnded -> done -> next lesson unlocked with zero watching.
-- complete_video now requires ~80% of the nominal runtime (videos.mins from
-- the DB, never client-claimed duration), unless views are burned (>=3 plays
-- already counts as completion-equivalent) or caller is admin.
-- NOTE: watched seconds are client-measured; this raises the bypass from a
-- zero-effort UI drag to deliberate RPC spoofing. True server-observed
-- heartbeats remain future work.

create or replace function complete_video(
  p_video uuid,
  p_watched_secs double precision default 0,
  p_duration_secs double precision default 0
) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_course uuid; v_mins int; v_views smallint;
begin
  if v_user is null then raise exception 'not signed in'; end if;
  select course_id, mins into v_course, v_mins from videos where id = p_video;
  if v_course is null then raise exception 'video not found'; end if;
  if not is_admin() and not exists (
    select 1 from enrollments
    where user_id = v_user and course_id = v_course and status = 'approved'
  ) then raise exception 'enrollment required'; end if;
  if is_admin() then
    insert into video_views (user_id, video_id, views_count, done)
    values (v_user, p_video, 0, true)
    on conflict (user_id, video_id) do update set done = true, updated_at = now();
    return;
  end if;
  select coalesce(
    (select views_count from video_views where user_id = v_user and video_id = p_video), 0)
    into v_views;
  -- burned all 3 views: completion-equivalent (matches unlock rule)
  if v_views >= 3 then
    insert into video_views (user_id, video_id, views_count, done)
    values (v_user, p_video, v_views, true)
    on conflict (user_id, video_id) do update set done = true, updated_at = now();
    return;
  end if;
  -- nominal runtime comes from the DB row, not the client claim
  if coalesce(v_mins, 0) > 0 and coalesce(p_watched_secs, 0) >= (v_mins * 60 * 0.8) then
    insert into video_views (user_id, video_id, views_count, done)
    values (v_user, p_video, v_views, true)
    on conflict (user_id, video_id) do update set done = true, updated_at = now();
    return;
  end if;
  raise exception 'watch requirement not met';
end $$;
