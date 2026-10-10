-- KineTech unlock stickiness + real exams — run AFTER 20261018_fix_watch_state_types.sql
--
-- F1. Sticky unlock: unlocking is sequential (part N needs N-1 done/burned),
--     but once a part opens it must STAY open — especially across admin
--     restarts of other parts. New video_views.unlocked flag, set on every
--     permitted play/completion, consulted first by the unlock rule.
--     Admin per-part restart clears views/done but preserves unlocked.
--
-- F4. Real exams + assignments: structured content lives on the video row
--     (JSONB, no extra content tables); student answers + grades live in
--     exam_results (one row per user/video/kind). Writing answers wait for
--     instructor scoring; choice answers score instantly.

-- ============ F1: sticky unlock flag ============
alter table video_views add column if not exists unlocked boolean not null default false;

-- ============ F4a: exam content columns on videos ============
-- exam_json / assign_json shape:
-- { "title": str, "questions": [ { "id": str, "kind": "choice"|"writing",
--   "prompt": str, "choices": str[] (choice only), "correct": int|null } ] }
alter table videos add column if not exists exam_json jsonb not null default '{"title":"","questions":[]}';
alter table videos add column if not exists assign_json jsonb not null default '{"title":"","questions":[]}';

-- ============ F4b: results (answers + grades) ============
-- status: 'graded' (all auto or instructor scored) | 'pending' (writing awaits).
-- choice_score/choice_total cover auto-scored parts; writing_score is set by
-- the instructor; total is computed client-side when displayed.
create table if not exists exam_results (
  user_id uuid not null references profiles(id) on delete cascade,
  video_id uuid not null references videos(id) on delete cascade,
  kind text not null check (kind in ('exam', 'assignment')),
  answers jsonb not null default '{}',
  choice_score int not null default 0,
  choice_total int not null default 0,
  writing_score int,
  writing_total int not null default 0,
  status text not null default 'pending' check (status in ('graded', 'pending')),
  updated_at timestamptz not null default now(),
  primary key (user_id, video_id, kind)
);

create index if not exists idx_results_video_status on exam_results (video_id, status);
create index if not exists idx_results_user on exam_results (user_id);

alter table exam_results enable row level security;

-- owners read/insert their own rows; may update answers only while ungraded.
drop policy if exists "read own results" on exam_results;
create policy "read own results" on exam_results for select
using (user_id = auth.uid() or is_admin());

drop policy if exists "insert own results" on exam_results;
create policy "insert own results" on exam_results for insert
with check (user_id = auth.uid());

drop policy if exists "update own ungraded results" on exam_results;
create policy "update own ungraded results" on exam_results for update
using (user_id = auth.uid() and status = 'pending')
with check (user_id = auth.uid());

drop policy if exists "admin manage results" on exam_results;
create policy "admin manage results" on exam_results for all
using (is_admin()) with check (is_admin());

-- ============ F1b: RPCs honor + persist the sticky flag ============
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
  -- ensure row exists, then lock it: concurrent tabs serialize here.
  -- the play itself was permitted, so the part is (and stays) unlocked.
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
    insert into video_views (user_id, video_id, views_count, done, unlocked)
    values (v_user, p_video, 0, true, true)
    on conflict (user_id, video_id) do update set done = true, unlocked = true, updated_at = now();
    return;
  end if;
  select coalesce(
    (select views_count from video_views where user_id = v_user and video_id = p_video), 0)
    into v_views;
  if v_views >= 3 then
    insert into video_views (user_id, video_id, views_count, done, unlocked)
    values (v_user, p_video, v_views, true, true)
    on conflict (user_id, video_id) do update set done = true, unlocked = true, updated_at = now();
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
    insert into video_views (user_id, video_id, views_count, done, unlocked)
    values (v_user, p_video, v_views, true, true)
    on conflict (user_id, video_id) do update set done = true, unlocked = true, updated_at = now();
    return;
  end if;
  raise exception 'watch requirement not met';
end $$;

-- get_watch_state: sticky flag wins over the sequential rule; also returned
-- so clients can mirror it locally.
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
           coalesce(vv.done, false) as dn,
           coalesce(vv.unlocked, false) as un
    from videos v2
    join modules m on m.id = v2.module_id
    left join module_translations mt on mt.module_id = m.id and mt.lang = p_lang
    left join video_views vv on vv.video_id = v2.id and vv.user_id = v_user
    where v2.course_id = v_course
  )
  select v.id, v.sort_order, v.title, v.description, v.src_url, v.mins,
         v.assign_url, v.exam_url, v.vc, v.dn,
         (v.un or v.sort_order = 0 or exists (
            select 1 from videos pv
            left join video_views pvv on pvv.video_id = pv.id and pvv.user_id = v_user
            where pv.course_id = v_course and pv.sort_order = v.sort_order - 1
              and (coalesce(pvv.done,false) or coalesce(pvv.views_count,0) >= 3)
         )) as unlocked,
         greatest(0, 3 - v.vc)::smallint as views_left
  from v order by v.sort_order;
end $$;
