-- KineTech video minutes self-heal — run AFTER 20261024_sessions_fifo.sql
--
-- The admin no longer types video minutes: the first real playback reports
-- the media's true duration and the server stores it on videos.mins.
-- completion (complete_video) already prefers a real duration; this makes
-- the stored fallback truth instead of a guess.

create or replace function report_video_mins(p_video uuid, p_mins int)
returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_cur int;
begin
  if v_user is null then raise exception 'not signed in'; end if;
  if p_mins is null or p_mins < 1 or p_mins > 600 then return; end if;
  select mins into v_cur from videos where id = p_video;
  if v_cur is null then raise exception 'video not found'; end if;
  -- Only someone who actually opened the lesson (or an admin) may correct it.
  if not is_admin() and not exists (
    select 1 from video_views where user_id = v_user and video_id = p_video
  ) then raise exception 'lesson not opened'; end if;
  if v_cur != p_mins then
    update videos set mins = p_mins where id = p_video;
  end if;
end $$;
