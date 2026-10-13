-- KineTech playback security core (phase 1) — additive, safe to run first.
-- Client deploy using these objects must go live BEFORE 20261033 (which
-- drops videos.src_url). Run order: this file -> deploy -> 20261033.
--
-- Contents:
--   video_sources  : Drive/YouTube URLs, RLS with NO policies (service role only)
--   active_sessions: single-session tracking, RLS with NO policies
--   watch_events   : play log + flags/denials, RLS with NO policies
--   request_play() : atomic gate+count RPC (all thresholds parameterized;
--                    canonical values live in api/config.ts — keep in sync)
--   admin RPCs     : video sources + video_views admin writes (client direct
--                    writes on video_views are revoked below)
--   suspicious_users view (revoked from anon/authenticated)
--   pg_cron retention attempt (falls back to opportunistic cleanup in /api/play)

-- ============ 1. video_sources ============
create table if not exists video_sources (
  video_id uuid primary key references videos(id) on delete cascade,
  src_url text not null
);
alter table video_sources enable row level security;
-- NO policies: only the service-role key (Vercel functions) reads this.

insert into video_sources (video_id, src_url)
select id, src_url from videos
where src_url is not null and btrim(src_url) <> ''
on conflict (video_id) do update set src_url = excluded.src_url;

-- videos.src_url becomes a write-only placeholder until 20261033 drops it:
-- new rows are created with '' while the real URL lives in video_sources.
alter table videos alter column src_url drop not null;

-- ============ 2. active_sessions ============
create table if not exists active_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  session_id uuid not null,
  user_agent text,
  updated_at timestamptz not null default now()
);
alter table active_sessions enable row level security;
-- NO policies: service role only.

-- ============ 3. watch_events ============
create table if not exists watch_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id uuid not null,
  ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  flagged boolean not null default false,
  denied boolean not null default false,
  reason text
);
create index if not exists idx_events_user_time on watch_events (user_id, created_at desc);
create index if not exists idx_events_user_video_time on watch_events (user_id, video_id, created_at desc);
create index if not exists idx_events_created on watch_events (created_at);
alter table watch_events enable row level security;
-- NO policies: service role only.

-- ============ 4. request_play: gate + count + log, atomically ============
-- Called by POST /api/play with the CALLER's JWT (auth.uid() = student).
-- Never returns src_url (secrecy boundary); the serverless function reads
-- video_sources separately with the service role.
-- Threshold defaults mirror api/config.ts — change both together.
create or replace function request_play(
  p_video uuid,
  p_session uuid,
  p_ip text,
  p_ua text,
  p_r1_max int default 5,
  p_r1_secs int default 30,
  p_r2_warn int default 120,
  p_r2_deny int default 240,
  p_r2_mins int default 60,
  p_r3_max int default 3,
  p_repeat_mins int default 30
)
returns table (
  ok boolean, code text, flagged boolean, minutes int,
  email text, phone_last4 text, views_left smallint, views_count smallint,
  consumed boolean
)
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_course uuid;
  v_mins int;
  v_admin boolean := false;
  v_banned boolean := false;
  v_email text := '';
  v_phone text := '';
  v_n int;
  v_recent boolean := false;
  v_vc smallint := 0;
  v_total int := 0;
  v_ips int := 0;
  v_flag boolean := false;
  v_r2 boolean := false;
  v_r3 boolean := false;
  v_consume boolean := true;
  v_reason text;
begin
  if v_user is null then
    return query select false, 'NOT_SIGNED_IN', false, 0, '', '',
      0::smallint, 0::smallint, false;
    return;
  end if;

  select v.course_id, v.mins into v_course, v_mins from videos v where v.id = p_video;
  if v_course is null then
    insert into watch_events (user_id, video_id, ip, user_agent, denied, reason)
    values (v_user, p_video, p_ip, p_ua, true, 'not_found');
    return query select false, 'NOT_FOUND', false, 0, '', '',
      0::smallint, 0::smallint, false;
    return;
  end if;

  select p.banned, p.email, p.phone, (p.role = 'admin')
    into v_banned, v_email, v_phone, v_admin
    from profiles p where p.id = v_user;
  if v_email is null then
    insert into watch_events (user_id, video_id, ip, user_agent, denied, reason)
    values (v_user, p_video, p_ip, p_ua, true, 'no_profile');
    return query select false, 'NO_PROFILE', false, 0, '', '',
      0::smallint, 0::smallint, false;
    return;
  end if;
  if coalesce(v_banned, false) then
    insert into watch_events (user_id, video_id, ip, user_agent, denied, reason)
    values (v_user, p_video, p_ip, p_ua, true, 'banned');
    return query select false, 'BANNED', false, 0, '', '',
      0::smallint, 0::smallint, false;
    return;
  end if;

  if not coalesce(v_admin, false)
     and not exists (select 1 from enrollments e where e.user_id = v_user and e.course_id = v_course) then
    insert into watch_events (user_id, video_id, ip, user_agent, denied, reason)
    values (v_user, p_video, p_ip, p_ua, true, 'not_enrolled');
    return query select false, 'NOT_ENROLLED', false, 0, '', '',
      0::smallint, 0::smallint, false;
    return;
  end if;

  -- R1: request rate (counts every hit, allowed or denied).
  select count(*) into v_n from watch_events e
   where e.user_id = v_user
     and e.created_at > now() - make_interval(secs => p_r1_secs);
  if v_n >= p_r1_max then
    insert into watch_events (user_id, video_id, ip, user_agent, denied, reason)
    values (v_user, p_video, p_ip, p_ua, true, 'r1-rate');
    return query select false, 'RATE_LIMITED', false, 0, '', '',
      0::smallint, 0::smallint, false;
    return;
  end if;

  -- View cap (admins never burn and never cap).
  if not coalesce(v_admin, false) then
    insert into video_views (user_id, video_id, views_count)
    values (v_user, p_video, 0)
    on conflict (user_id, video_id) do nothing;
    select vv.views_count into v_vc from video_views vv
     where vv.user_id = v_user and vv.video_id = p_video for update;
    v_vc := coalesce(v_vc, 0);
    if v_vc >= 3 then
      insert into watch_events (user_id, video_id, ip, user_agent, denied, reason)
      values (v_user, p_video, p_ip, p_ua, true, 'view-cap');
      return query select false, 'VIEW_CAP', false, coalesce(v_mins, 0), v_email,
        right(coalesce(v_phone, ''), 4), 0::smallint, v_vc, false;
      return;
    end if;
    -- Repeat window: same video, un-denied, same 30min -> no new burn.
    select exists (
      select 1 from watch_events e
       where e.user_id = v_user and e.video_id = p_video
         and e.denied = false
         and e.created_at > now() - make_interval(secs => p_repeat_mins * 60)
    ) into v_recent;
  end if;

  -- R2: distinct-minutes volume over the trailing window (current included).
  select coalesce(sum(v2.mins), 0) into v_total
    from (select distinct e.video_id from watch_events e
           where e.user_id = v_user
             and e.created_at > now() - make_interval(secs => p_r2_mins * 60)) d
    join videos v2 on v2.id = d.video_id;
  if not exists (
    select 1 from watch_events e
     where e.user_id = v_user and e.video_id = p_video
       and e.created_at > now() - make_interval(secs => p_r2_mins * 60)
  ) then
    v_total := v_total + coalesce(v_mins, 0);
  end if;
  if v_total > p_r2_deny then
    insert into watch_events (user_id, video_id, ip, user_agent, denied, reason)
    values (v_user, p_video, p_ip, p_ua, true, 'r2-deny');
    return query select false, 'SUSPICIOUS_DENY', true, 0, '', '',
      0::smallint, 0::smallint, false;
    return;
  elsif v_total > p_r2_warn then
    v_r2 := true; v_flag := true;
  end if;

  -- R3: distinct IPs in 24h, current included — flag ONLY, never deny
  -- (Egyptian mobile networks rotate IPs on honest students).
  select count(*) into v_ips from (
    select e.ip from watch_events e
     where e.user_id = v_user and e.created_at > now() - interval '24 hours'
    union
    select coalesce(p_ip, '')
  ) s;
  if v_ips > p_r3_max then
    v_r3 := true; v_flag := true;
  end if;

  -- Consume one view (repeat window and admins excluded).
  if coalesce(v_admin, false) then
    insert into video_views (user_id, video_id, views_count, unlocked)
    values (v_user, p_video, 0, true)
    on conflict (user_id, video_id) do update set unlocked = true, updated_at = now();
    v_consume := false;
  elsif not v_recent then
    update video_views set views_count = v_vc + 1, unlocked = true, updated_at = now()
     where user_id = v_user and video_id = p_video;
    v_vc := v_vc + 1;
    v_consume := true;
  else
    v_consume := false;
    update video_views set unlocked = true, updated_at = now()
     where user_id = v_user and video_id = p_video;
  end if;

  v_reason := nullif(concat_ws(',', case when v_r2 then 'r2' end, case when v_r3 then 'r3' end), '');
  insert into watch_events (user_id, video_id, ip, user_agent, flagged, denied, reason)
  values (v_user, p_video, p_ip, p_ua, v_flag, false, v_reason);

  return query select true, 'OK', v_flag, coalesce(v_mins, 0), v_email,
    right(coalesce(v_phone, ''), 4), greatest(0, 3 - v_vc)::smallint, v_vc, v_consume;
  return;
end $$;

-- ============ 5. admin RPCs (video sources + video_views writes) ============
-- Client direct writes on video_views are revoked below; admins act through
-- these is_admin()-gated functions instead. SELECTs keep working via the
-- existing "admin manage views" policy (only insert/update/delete revoked).

create or replace function admin_video_sources(p_slug text)
returns table (video_id uuid, sort_order int, src_url text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin only'; end if;
  return query
    select v.id, v.sort_order, coalesce(s.src_url, '')
      from videos v
      join courses c on c.id = v.course_id
      left join video_sources s on s.video_id = v.id
     where c.slug = p_slug
     order by v.sort_order;
end $$;

create or replace function admin_set_video_src(p_video uuid, p_src text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin only'; end if;
  insert into video_sources (video_id, src_url)
  values (p_video, p_src)
  on conflict (video_id) do update set src_url = excluded.src_url;
end $$;

create or replace function admin_delete_video(p_video uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin only'; end if;
  delete from videos where id = p_video;
end $$;

create or replace function admin_upsert_video(
  p_course uuid, p_module uuid, p_order int,
  p_mins int, p_assign text, p_exam text
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_admin() then raise exception 'admin only'; end if;
  -- src_url placeholder: the real URL is written to video_sources separately
  -- (admin_set_video_src). Kept non-blank-safe for the pre-drop column.
  insert into videos (course_id, module_id, sort_order, src_url, mins, assign_url, exam_url)
  values (p_course, p_module, p_order, '', coalesce(p_mins, 10), nullif(p_assign, ''), nullif(p_exam, ''))
  on conflict (course_id, sort_order) do update set
    module_id = excluded.module_id,
    mins = excluded.mins,
    assign_url = excluded.assign_url,
    exam_url = excluded.exam_url
  returning id into v_id;
  return v_id;
end $$;

create or replace function admin_reset_video(p_user uuid, p_video uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin only'; end if;
  -- UPDATE, never delete: preserves the sticky unlock flag.
  update video_views set views_count = 0, done = false, updated_at = now()
   where user_id = p_user and video_id = p_video;
end $$;

create or replace function admin_reset_course_views(p_user uuid, p_course uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not is_admin() then raise exception 'admin only'; end if;
  delete from video_views
   where user_id = p_user
     and video_id in (select id from videos where course_id = p_course);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function admin_revoke_course_data(p_user uuid, p_course uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin only'; end if;
  delete from video_views
   where user_id = p_user
     and video_id in (select id from videos where course_id = p_course);
  delete from enrollments where user_id = p_user and course_id = p_course;
end $$;

-- ============ 6. lock client writes on video_views ============
-- Reads stay (own + admin policies). RPCs above are SECURITY DEFINER, so
-- admin flows keep working through them.
revoke insert, update, delete on video_views from anon, authenticated;

-- ============ 7. suspicious_users review view (NOT API-exposed) ============
create or replace view suspicious_users as
select e.user_id,
       p.name,
       p.email,
       count(*) filter (where e.flagged) as flags,
       count(*) filter (where e.denied) as denials,
       string_agg(distinct e.reason, ', ') filter (where e.reason is not null) as last_reasons,
       max(e.created_at) as last_event
  from watch_events e
  left join profiles p on p.id = e.user_id
 group by e.user_id, p.name, p.email
having count(*) filter (where e.flagged or e.denied) > 0;
revoke all on suspicious_users from anon, authenticated;

-- ============ 8. retention: pg_cron attempt + opportunistic fallback ============
-- pg_cron is not guaranteed on free tiers: try it, fall back to the
-- opportunistic delete inside POST /api/play (always runs, indexed scan).
do $cron$ begin
  create extension if not exists pg_cron;
  perform cron.schedule(
    'purge-watch-events-90d',
    '0 3 * * *',
    $cmd$delete from public.watch_events where created_at < now() - interval '90 days'$cmd$
  );
exception when others then
  raise notice 'pg_cron unavailable — relying on opportunistic cleanup in /api/play';
end $cron$;
