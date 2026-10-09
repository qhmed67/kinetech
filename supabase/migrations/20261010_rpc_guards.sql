-- KineTech RPC hardening — run AFTER 20261009_completion_gate.sql
-- get_watch_state previously relied on the enrollment check failing closed
-- for anonymous callers. Add the same explicit not-signed-in guard the other
-- watch RPCs carry, so the fail-closed behavior is intentional, not accidental.

-- Rerun-safe: enrollment-gated body installs ONLY on the old schema.
-- On a migrated DB the modern signed-in version (v20261013+) is left alone.
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'enrollments' and column_name = 'status'
  ) then
    raise notice 'rpc_guards: skipping legacy enrollment-gated get_watch_state (modern schema present)';
    return;
  end if;
  execute $legacy$create or replace function get_watch_state(p_slug text, p_lang char(2))
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
  -- must hold an APPROVED enrollment (or be admin) to see URLs
  if not is_admin() and not exists (
    select 1 from enrollments
    where user_id = v_user and course_id = v_course and status = 'approved'
  ) then
    raise exception 'enrollment required';
  end if;
  return query
  with v as (
    select v2.id, v2.sort_order, v2.src_url, v2.mins, v2.assign_url, v2.exam_url,
           mt.title, mt.description,
           coalesce(vv.views_count, 0) as vc, coalesce(vv.done, false) as dn
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
end $$;$legacy$;
  end if;
end $$;
