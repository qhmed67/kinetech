-- KineTech admin_upsert_video without src_url — run anytime.
--
-- BUG fixed: the 20261032 version inserted a src_url '' placeholder for the
-- pre-drop column. After 20261033 dropped videos.src_url, EVERY call to this
-- function failed with 'column "src_url" of relation "videos" does not
-- exist' — aborting all admin course saves. This version never references
-- the column (works before and after the drop; pre-drop DBs simply leave
-- the old value, and video_sources carries the truth regardless).

create or replace function admin_upsert_video(
  p_course uuid, p_module uuid, p_order int,
  p_mins int, p_assign text, p_exam text
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_admin() then raise exception 'admin only'; end if;
  insert into videos (course_id, module_id, sort_order, mins, assign_url, exam_url)
  values (p_course, p_module, p_order, coalesce(p_mins, 10), nullif(p_assign, ''), nullif(p_exam, ''))
  on conflict (course_id, sort_order) do update set
    module_id = excluded.module_id,
    mins = excluded.mins,
    assign_url = excluded.assign_url,
    exam_url = excluded.exam_url
  returning id into v_id;
  return v_id;
end $$;
