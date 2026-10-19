-- KineTech unlock-on-start — run anytime (pure function replacements).
--
-- Rule change (owner decision): the NEXT part opens when the previous part
-- STARTS, not when it completes. "Started" = the previous part has a
-- video_views row for this user with unlocked=true or views_count > 0,
-- i.e., at least one playback grant succeeded for it. The previous "done"
-- path stays valid (older completions still count); 80%/end done semantics
-- are untouched — done simply loses its role as the only unlock trigger.
-- Sticky unlock flag, admin bypasses, view caps, repeat guard unchanged.

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
    select v2.id, v2.sort_order, v2.mins, v2.assign_url, v2.exam_url,
           mt.title, mt.description,
           coalesce(vv.views_count, 0)::smallint as vc,
           coalesce(vv.done, false) as dn,
           coalesce(vv.unlocked, false) as un
    from videos v2
    join modules m on m.id = v2.module_id
    left join module_translations mt on mt.module_id = m.id and mt.lang = p_lang
    left join video_views vv on vv.video_id = v2.id and vv.user_id = v_user
    where v2.course_id = v_course
  )
  select v.id, v.sort_order, v.title, v.description, ''::text,
         v.mins, v.assign_url, v.exam_url, v.vc, v.dn,
         (v.un or v.sort_order = 0 or exists (
            select 1 from videos pv
            left join video_views pvv on pvv.video_id = pv.id and pvv.user_id = v_user
            where pv.course_id = v_course and pv.sort_order = v.sort_order - 1
              and (coalesce(pvv.done, false)
                   or coalesce(pvv.unlocked, false)
                   or coalesce(pvv.views_count, 0) > 0)
         )) as unlocked,
         greatest(0, 3 - v.vc)::smallint as views_left
  from v order by v.sort_order;
end $$;

create or replace function record_play(p_video uuid)
returns table (views_count smallint, views_left smallint)
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_course uuid; v_pos int; v_vc smallint;
begin
  if v_user is null then raise exception 'not signed in'; end if;
  select course_id, sort_order into v_course, v_pos from videos where id = p_video;
  if v_course is null then raise exception 'video not found'; end if;
  if v_pos > 0 and not exists (
    select 1 from videos pv
    left join video_views pvv on pvv.video_id = pv.id and pvv.user_id = v_user
    where pv.course_id = v_course and pv.sort_order = v_pos - 1
      and (coalesce(pvv.done, false)
           or coalesce(pvv.unlocked, false)
           or coalesce(pvv.views_count, 0) > 0)
  ) then raise exception 'previous lesson locked'; end if;
  insert into video_views (user_id, video_id, views_count, unlocked)
  values (v_user, p_video, 0, true)
  on conflict (user_id, video_id) do nothing;
  select vv.views_count into v_vc from video_views vv
   where vv.user_id = v_user and vv.video_id = p_video for update;
  if v_vc is null then raise exception 'progress row missing'; end if;
  if v_vc < 3 then
    update video_views set views_count = v_vc + 1, unlocked = true, updated_at = now()
     where user_id = v_user and video_id = p_video;
    v_vc := v_vc + 1;
  else
    update video_views set unlocked = true, updated_at = now()
     where user_id = v_user and video_id = p_video;
  end if;
  return query select v_vc, greatest(0, 3 - v_vc)::smallint;
end $$;

create or replace function touch_unlocked(p_video uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_course uuid; v_pos int; v_un boolean;
begin
  if v_user is null then raise exception 'not signed in'; end if;
  select course_id, sort_order into v_course, v_pos from videos where id = p_video;
  if v_course is null then raise exception 'video not found'; end if;
  select coalesce(
    (select unlocked from video_views where user_id = v_user and video_id = p_video), false)
    into v_un;
  if v_pos > 0 and not v_un and not exists (
    select 1 from videos pv
    left join video_views pvv on pvv.video_id = pv.id and pvv.user_id = v_user
    where pv.course_id = v_course and pv.sort_order = v_pos - 1
      and (coalesce(pvv.done, false)
           or coalesce(pvv.unlocked, false)
           or coalesce(pvv.views_count, 0) > 0)
  ) then raise exception 'previous lesson locked'; end if;
  insert into video_views (user_id, video_id, views_count, done, unlocked)
  values (v_user, p_video, 0, false, true)
  on conflict (user_id, video_id) do update set unlocked = true, updated_at = now();
end $$;

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
      and (coalesce(pvv.done, false)
           or coalesce(pvv.unlocked, false)
           or coalesce(pvv.views_count, 0) > 0)
  );
end $$;
