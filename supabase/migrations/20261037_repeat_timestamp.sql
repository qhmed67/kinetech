-- KineTech repeat-path timestamp honesty — run anytime.
--
-- request_play's repeat window (same video+session inside 30 minutes burns
-- nothing) also bumped updated_at, so the admin sheet looked "active"
-- (moving time) while the count correctly stood still. The timestamp now
-- moves only on real burns and explicit unlocks — time == progress again.

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
    select exists (
      select 1 from watch_events e
       where e.user_id = v_user and e.video_id = p_video
         and e.denied = false
         and e.created_at > now() - make_interval(secs => p_repeat_mins * 60)
    ) into v_recent;
  end if;

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

  select count(*) into v_ips from (
    select e.ip from watch_events e
     where e.user_id = v_user and e.created_at > now() - interval '24 hours'
    union
    select coalesce(p_ip, '')
  ) s;
  if v_ips > p_r3_max then
    v_r3 := true; v_flag := true;
  end if;

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
    -- Repeat window: no burn AND no timestamp touch (admin sheet stays
    -- burn-truthful). Unlock flag still mirrored (idempotent).
    v_consume := false;
    update video_views set unlocked = true
     where user_id = v_user and video_id = p_video;
  end if;

  v_reason := nullif(concat_ws(',', case when v_r2 then 'r2' end, case when v_r3 then 'r3' end), '');
  insert into watch_events (user_id, video_id, ip, user_agent, flagged, denied, reason)
  values (v_user, p_video, p_ip, p_ua, v_flag, false, v_reason);

  return query select true, 'OK', v_flag, coalesce(v_mins, 0), v_email,
    right(coalesce(v_phone, ''), 4), greatest(0, 3 - v_vc)::smallint, v_vc, v_consume;
  return;
end $$;
