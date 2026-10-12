-- KineTech report_video_mins: enrolled students may correct — run AFTER 20261026_lesson_notify_trigger.sql
--
-- Bulk duration heal (student course page measures every part at once)
-- reports lessons the caller hasn't opened yet, so the gate widens from
-- "opened or admin" to "enrolled in the course or admin". Values stay
-- clamped 1..600 and only applied on change.

create or replace function report_video_mins(p_video uuid, p_mins int)
returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_cur int; v_course uuid;
begin
  if v_user is null then raise exception 'not signed in'; end if;
  if p_mins is null or p_mins < 1 or p_mins > 600 then return; end if;
  select mins, course_id into v_cur, v_course from videos where id = p_video;
  if v_cur is null then raise exception 'video not found'; end if;
  -- Someone who opened the lesson, anyone enrolled in its course, or admin.
  if not is_admin()
     and not exists (select 1 from video_views where user_id = v_user and video_id = p_video)
     and not exists (select 1 from enrollments where user_id = v_user and course_id = v_course)
  then raise exception 'not enrolled'; end if;
  if v_cur != p_mins then
    update videos set mins = p_mins where id = p_video;
  end if;
end $$;
