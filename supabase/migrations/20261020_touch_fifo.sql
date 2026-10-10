-- KineTech restart-isolation + notification FIFO — run AFTER 20261019_unlock_exams.sql
--
-- F1. touch_unlocked: persists "this part was opened while entitled" without
--     burning a view. Opening never costs views_count — only real playback
--     (record_play) increments. Used so an admin restart of part N can never
--     re-lock part N+1 that was already open.
--
-- F3. Notification FIFO cap (5 per user, newest first): a trigger prunes
--     anything older on every insert — one rule for manual, broadcast, and
--     automatic notices alike. No client counting, no races.

-- ============ touch_unlocked RPC ============
create or replace function touch_unlocked(p_video uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_course uuid; v_pos int; v_un boolean;
begin
  if v_user is null then raise exception 'not signed in'; end if;
  select course_id, sort_order into v_course, v_pos from videos where id = p_video;
  if v_course is null then raise exception 'video not found'; end if;
  -- Same gate as playback: only an already-entitled part may go sticky.
  -- Skipping ahead via direct RPC calls stays locked.
  select coalesce(
    (select unlocked from video_views where user_id = v_user and video_id = p_video), false)
    into v_un;
  if v_pos > 0 and not v_un and not exists (
    select 1 from videos pv
    left join video_views pvv on pvv.video_id = pv.id and pvv.user_id = v_user
    where pv.course_id = v_course and pv.sort_order = v_pos - 1
      and (coalesce(pvv.done,false) or coalesce(pvv.views_count,0) >= 3)
  ) then raise exception 'previous lesson locked'; end if;
  insert into video_views (user_id, video_id, views_count, done, unlocked)
  values (v_user, p_video, 0, false, true)
  on conflict (user_id, video_id) do update set unlocked = true, updated_at = now();
end $$;

-- ============ notifications FIFO (5 newest per user) ============
create or replace function prune_notifications() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from notifications
  where user_id = new.user_id
    and id not in (
      select id from notifications
      where user_id = new.user_id
      order by created_at desc, id desc
      limit 5
    );
  return new;
end $$;

drop trigger if exists trg_prune_notifications on notifications;
create trigger trg_prune_notifications after insert on notifications
for each row execute function prune_notifications();
