-- KineTech real-duration completion — run AFTER 20261015_auto_profile.sql
--
-- complete_video previously validated watch time against videos.mins, a
-- nominal label defaulting to 10 — a 1-minute video could never complete
-- (dashboard progress stuck at 0%), while a padded label could complete
-- early. The client now sends the real media duration; the server prefers
-- it and falls back to the nominal minutes only when absent.

create or replace function complete_video(
  p_video uuid,
  p_watched_secs double precision default 0,
  p_duration_secs double precision default 0
) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_course uuid; v_mins int; v_views smallint; v_need double precision;
begin
  if v_user is null then raise exception 'not signed in'; end if;
  select course_id, mins into v_course, v_mins from videos where id = p_video;
  if v_course is null then raise exception 'video not found'; end if;
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
  -- real media duration wins; nominal minutes label is only a fallback
  if coalesce(p_duration_secs, 0) > 0 then
    v_need := p_duration_secs * 0.8;
  elsif coalesce(v_mins, 0) > 0 then
    v_need := v_mins * 60 * 0.8;
  else
    v_need := 0;
  end if;
  if v_need > 0 and coalesce(p_watched_secs, 0) >= v_need then
    insert into video_views (user_id, video_id, views_count, done)
    values (v_user, p_video, v_views, true)
    on conflict (user_id, video_id) do update set done = true, updated_at = now();
    return;
  end if;
  raise exception 'watch requirement not met';
end $$;
