-- KineTech completion on video end — run AFTER 20261027_report_mins_enrolled.sql
--
-- Rule change: when the player fires ENDED, the lesson counts as watched —
-- even via seek-to-end. Rationale: burned-out views (3/3 spent on refreshes)
-- left students stuck with no path to open the next part. Watching remains
-- the honest path; this is the escape hatch, and it is the student's choice.
-- The 80% genuine-watch rule still applies to every non-ended completion.

create or replace function complete_video(
  p_video uuid,
  p_watched_secs double precision default 0,
  p_duration_secs double precision default 0,
  p_ended boolean default false
) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_course uuid; v_mins int; v_need double precision;
begin
  if v_user is null then raise exception 'not signed in'; end if;
  select course_id, mins into v_course, v_mins from videos where id = p_video;
  if v_course is null then raise exception 'video not found'; end if;
  if is_admin() then
    insert into video_views (user_id, video_id, views_count, done, unlocked)
    values (v_user, p_video, 0, true, true)
    on conflict (user_id, video_id) do update set done = true, unlocked = true, updated_at = now();
    return;
  end if;
  -- Ended playback completes outright (seek-to-end included, by decision).
  if coalesce(p_ended, false) then
    insert into video_views (user_id, video_id, views_count, done, unlocked)
    values (v_user, p_video, (select coalesce((select views_count from video_views where user_id = v_user and video_id = p_video), 0)), true, true)
    on conflict (user_id, video_id) do update set done = true, unlocked = true, updated_at = now();
    return;
  end if;
  -- Completion ONLY from genuine watch time. Burned views no longer count.
  if coalesce(p_duration_secs, 0) > 0 then
    v_need := p_duration_secs * 0.8;
  elsif coalesce(v_mins, 0) > 0 then
    v_need := v_mins * 60 * 0.8;
  else
    v_need := 0;
  end if;
  if v_need > 0 and coalesce(p_watched_secs, 0) >= v_need then
    insert into video_views (user_id, video_id, views_count, done, unlocked)
    values (v_user, p_video, (select coalesce((select views_count from video_views where user_id = v_user and video_id = p_video), 0)), true, true)
    on conflict (user_id, video_id) do update set done = true, unlocked = true, updated_at = now();
    return;
  end if;
  raise exception 'watch requirement not met';
end $$;
