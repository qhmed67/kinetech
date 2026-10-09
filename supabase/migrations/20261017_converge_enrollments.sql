-- KineTech enrollment convergence repair — run AFTER 20261016_duration_completion.sql
-- (or anytime the DB history is uncertain).
--
-- Problem: v20261007 (init) and v20261012 (column locks) both reference the
-- old enrollments.status column. Rerunning either file AFTER the v7 drop /
-- v8 recreate aborts with `column "status" does not exist`, and a DB that
-- skipped v7 still runs enrollment-gated RPCs that deny every student.
-- This file converges any history to the correct final state. Idempotent.
--
-- FINAL CONTRACT (must hold after this file):
--   enrollments(user_id, course_id, granted_at) — no status column.
--   Watch RPCs gate on signed-in user only. Videos readable when signed in.

-- ============ 1. Heal a stale old-schema enrollments table ============
-- (v7 drop missed / was skipped: migrate columns in place, keep grant rows)
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'enrollments' and column_name = 'status'
  ) then
    alter table enrollments drop column if exists status;
    alter table enrollments drop column if exists enrolled_at;
    alter table enrollments drop column if exists decided_at;
    alter table enrollments add column if not exists granted_at timestamptz not null default now();
  end if;
end $$;

-- Guarantee the v8 shape even if v8 was skipped entirely.
create table if not exists enrollments (
  user_id uuid not null references profiles(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (user_id, course_id)
);

create index if not exists idx_enroll_course on enrollments (course_id);
alter table enrollments enable row level security;

-- Obsolete status-based policies must go, whatever created them.
drop policy if exists "request enrollment pending" on enrollments;
drop policy if exists "cancel own pending enrollment" on enrollments;
drop policy if exists "read own enrollments" on enrollments;
drop policy if exists "admin manage enrollments" on enrollments;
create policy "read own enrollments" on enrollments for select
using (user_id = auth.uid() or is_admin());
create policy "admin manage enrollments" on enrollments for all
using (is_admin()) with check (is_admin());

-- ============ 2. Videos readable when signed in (drop stale variants) ============
drop policy if exists "enrolled read videos" on videos;
drop policy if exists "signed-in read videos" on videos;
create policy "signed-in read videos" on videos for select
using (auth.uid() is not null);

-- ============ 3. Watch RPCs: signed-in only (any historical variant) ============
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

create or replace function complete_video(
  p_video uuid,
  p_watched_secs double precision default 0,
  p_duration_secs double precision default 0
) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_course uuid; v_mins int; v_views smallint; v_need double precision;
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
  if v_views >= 3 then
    insert into video_views (user_id, video_id, views_count, done)
    values (v_user, p_video, v_views, true)
    on conflict (user_id, video_id) do update set done = true, updated_at = now();
    return;
  end if;
  if coalesce(p_duration_secs, 0) > 0 then
    v_need := p_duration_secs * 0.8;
  elsif coalesce(v_mins, 0) > 0 then
    v_need := v_mins * 60 * 0.8;
  else
    v_need := 0;
  end if;
  if v_need > 0 and coalesce(p_watched_secs, 0) >= v_need then
    insert into video_views (user_id, video_id, views_count, done)
    values (v_user, p_video, v_views, true)
    on conflict (user_id, video_id) do update set done = true, updated_at = now();
    return;
  end if;
  raise exception 'watch requirement not met';
end $$;
