-- KineTech enrollment removal — run AFTER 20261012_column_locks.sql
--
-- Enrollment is WhatsApp-only; no enrollment state lives in the database.
-- This migration:
--   1. Rewrites the three watch RPCs to gate on signed-in user only
--      (3-view cap + sequential unlock + watch-time rules unchanged).
--   2. Swaps the videos SELECT policy from approved-enrollment to signed-in.
--   3. Drops the enrollments table (policies cascade with it).
-- Applied migrations are never edited — everything here is additive.

-- ============ 1a. get_watch_state: signed-in only ============
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
end $$;

-- ============ 1b. record_play: signed-in only, still atomic ============
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
      and (coalesce(pvv.done,false) or coalesce(pvv.views_count,0) >= 3)
  ) then raise exception 'previous lesson locked'; end if;
  -- ensure row exists, then lock it: concurrent tabs serialize here
  insert into video_views (user_id, video_id, views_count)
  values (v_user, p_video, 0)
  on conflict (user_id, video_id) do nothing;
  select vv.views_count into v_vc from video_views vv
   where vv.user_id = v_user and vv.video_id = p_video for update;
  if v_vc is null then raise exception 'progress row missing'; end if;
  if v_vc < 3 then
    update video_views set views_count = v_vc + 1, updated_at = now()
     where user_id = v_user and video_id = p_video;
    v_vc := v_vc + 1;
  end if;
  return query select v_vc, greatest(0, 3 - v_vc)::smallint;
end $$;

-- ============ 1c. complete_video: signed-in only, watch-time gated ============
create or replace function complete_video(
  p_video uuid,
  p_watched_secs double precision default 0,
  p_duration_secs double precision default 0
) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_course uuid; v_mins int; v_views smallint;
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
  -- nominal runtime comes from the DB row, not the client claim
  if coalesce(v_mins, 0) > 0 and coalesce(p_watched_secs, 0) >= (v_mins * 60 * 0.8) then
    insert into video_views (user_id, video_id, views_count, done)
    values (v_user, p_video, v_views, true)
    on conflict (user_id, video_id) do update set done = true, updated_at = now();
    return;
  end if;
  raise exception 'watch requirement not met';
end $$;

-- ============ 2. videos readable by any signed-in user ============
drop policy if exists "enrolled read videos" on videos;
drop policy if exists "signed-in read videos" on videos;
create policy "signed-in read videos" on videos for select
using (auth.uid() is not null);

-- ============ 3. drop the enrollments table (policies cascade) ============
drop table if exists enrollments;
