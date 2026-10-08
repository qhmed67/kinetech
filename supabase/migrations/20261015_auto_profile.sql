-- KineTech auth self-healing — run AFTER 20261014_admin_enrollments.sql
--
-- Closes the half-created-user class: if profile creation fails after
-- auth.signUp (network blip, RLS hiccup, cross-device confirm), the account
-- used to end up with an auth row but no profile — sign-in then failed
-- closed with a misleading "account no longer exists" error.
-- A trigger now guarantees every auth.users row gets a profiles row.
-- All client inserts use ON CONFLICT DO NOTHING, so trigger and backfills
-- can never collide.

create or replace function handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  v_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'name', ''),
    nullif(split_part(new.email, '@', 1), '')
  );
  insert into public.profiles (id, email, name)
  values (new.id, new.email, coalesce(v_name, 'Student'))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function handle_new_auth_user();

-- Admin orphan readout: auth accounts with no profile row (e.g. deleted
-- via the panel before this migration). SECURITY DEFINER bypasses RLS, so
-- the admin check lives inside the body — never trust the caller.
create or replace function list_orphans()
returns table (user_id uuid, email text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin only'; end if;
  return query
  select u.id, u.email::text, u.created_at
  from auth.users u
  left join public.profiles p on p.id = u.id
  where p.id is null
  order by u.created_at desc;
end $$;

-- Client upserts (signup backfill, track activation) hit ON CONFLICT paths,
-- which require an UPDATE policy even when values are identical.
drop policy if exists "update own tracks" on user_tracks;
create policy "update own tracks" on user_tracks for update
using (user_id = auth.uid() or is_admin())
with check (user_id = auth.uid() or is_admin());

-- complete_video no longer takes p_duration_secs: validation uses DB-side
-- videos.mins exclusively, so the parameter only implied client control.
create or replace function complete_video(
  p_video uuid,
  p_watched_secs double precision default 0
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
