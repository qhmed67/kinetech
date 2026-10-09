-- KineTech hardening migration — run AFTER 20261007_kinetech_init.sql
-- 1. Role-insert lock: profiles INSERT policy allows auth.uid()=id but never
--    constrained `role`, so a direct API insert could self-grant 'admin'.
--    Trigger below forces 'student' unless caller is already admin.
-- 2. Atomic record_play: previous SELECT-then-UPSERT lost counts when two tabs
--    played concurrently. New body ensures the row, locks it (FOR UPDATE —
--    concurrent tabs serialize), then increments only while views_count < 3.

-- ============ 1. role-insert lock ============
create or replace function lock_role_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from 'student' and not is_admin() then
    raise exception 'role assignment denied';
  end if;
  return new;
end $$;

drop trigger if exists trg_lock_role_insert on profiles;
create trigger trg_lock_role_insert before insert on profiles
for each row execute function lock_role_insert();

-- ============ 2. atomic record_play ============
-- Rerun-safe: this enrollment-gated body installs ONLY on the old schema.
-- On a migrated DB the modern signed-in version (v20261013+) is left alone —
-- a blind rerun must never downgrade it (or every student gets locked out).
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'enrollments' and column_name = 'status'
  ) then
    raise notice 'hardening: skipping legacy enrollment-gated record_play (modern schema present)';
    return;
  end if;
  execute $legacy$create or replace function record_play(p_video uuid)
returns table (views_count smallint, views_left smallint)
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_course uuid; v_pos int; v_vc smallint;
begin
  if v_user is null then raise exception 'not signed in'; end if;
  select course_id, sort_order into v_course, v_pos from videos where id = p_video;
  if v_course is null then raise exception 'video not found'; end if;
  if not is_admin() and not exists (
    select 1 from enrollments
    where user_id = v_user and course_id = v_course and status = 'approved'
  ) then raise exception 'enrollment required'; end if;
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
end $$;$legacy$;
  end if;
end $$;
