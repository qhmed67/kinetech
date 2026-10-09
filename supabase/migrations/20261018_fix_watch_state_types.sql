-- KineTech watch-state type fix — run AFTER 20261017_converge_enrollments.sql
--
-- ROOT CAUSE (proven by live test): get_watch_state aborted on every call
-- with `structure of query does not match function result type` (42P13).
-- coalesce(smallint, 0) widens to INTEGER, but the declared return column
-- views_count is smallint. One cast fixes every read path at once
-- (player open, check-again, dashboard progress, admin per-part sheet) —
-- all of which silently fell back to local-only data because of this.
-- Idempotent: replaces the function body, nothing else moves.

create or replace function get_watch_state(p_slug text, p_lang char(2))
returns table (
  video_id uuid, sort_order int, title text, description text,
  src_url text, mins int, assign_url text, exam_url text,
  views_count smallint, done boolean, unlocked boolean, views_left smallint
)
language plpgsql stable security definer set search_path = public as $$
declare v_course uuid; v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not signed in'; end if;
  select id into v_course from courses where slug = p_slug;
  if v_course is null then return; end if;
  return query
  with v as (
    select v2.id, v2.sort_order, v2.src_url, v2.mins, v2.assign_url, v2.exam_url,
           mt.title, mt.description,
           coalesce(vv.views_count, 0)::smallint as vc,
           coalesce(vv.done, false) as dn
    from videos v2
    join modules m on m.id = v2.module_id
    left join module_translations mt on mt.module_id = m.id and mt.lang = p_lang
    left join video_views vv on vv.video_id = v2.id and vv.user_id = v_user
    where v2.course_id = v_course
  )
  select v.id, v.sort_order, v.title, v.description, v.src_url, v.mins,
         v.assign_url, v.exam_url, v.vc, v.dn,
         (v.sort_order = 0 or exists (
            select 1 from videos pv
            left join video_views pvv on pvv.video_id = pv.id and pvv.user_id = v_user
            where pv.course_id = v_course and pv.sort_order = v.sort_order - 1
              and (coalesce(pvv.done,false) or coalesce(pvv.views_count,0) >= 3)
         )) as unlocked,
         greatest(0, 3 - v.vc)::smallint as views_left
  from v order by v.sort_order;
end $$;
