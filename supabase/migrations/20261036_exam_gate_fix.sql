-- KineTech exam gate fix — run anytime (pure function replacement).
--
-- REGRESSION fixed: the 20261034 gate required a video_views.unlocked row,
-- but a lesson opened for the FIRST time has no row yet — exams/assignments
-- on freshly opened lessons were wrongly locked ("destroyed function").
-- The gate now mirrors the watch unlock rule exactly: sticky flag OR first
-- lesson OR previous lesson done (plus enrollment + admin bypass, unchanged).

create or replace function exam_gate_ok(p_video uuid, p_user uuid)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_course uuid; v_pos int;
begin
  select v.course_id, v.sort_order into v_course, v_pos
    from videos v where v.id = p_video;
  if v_course is null then return false; end if;
  if exists (select 1 from profiles p where p.id = p_user and p.role = 'admin') then
    return true;
  end if;
  if not exists (select 1 from enrollments e where e.user_id = p_user and e.course_id = v_course) then
    return false;
  end if;
  if v_pos = 0 then return true; end if;
  if exists (
    select 1 from video_views vv
     where vv.user_id = p_user and vv.video_id = p_video and coalesce(vv.unlocked, false)
  ) then
    return true;
  end if;
  return exists (
    select 1 from videos pv
    left join video_views pvv on pvv.video_id = pv.id and pvv.user_id = p_user
    where pv.course_id = v_course and pv.sort_order = v_pos - 1
      and coalesce(pvv.done, false)
  );
end $$;
