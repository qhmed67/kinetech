-- KineTech column-level hardening — run AFTER 20261011_activity.sql
--
-- G1. notifications UPDATE policy is owner-scoped but column-blind: a user
--     could rewrite their own notification title/message, not just is_read.
--     Trigger below permits ONLY is_read flips (admins bypass).
--
-- G2. profiles.email is owner-updatable, so the video-watermark identity
--     (read from profiles.email) is forgeable and can desync from the real
--     auth.users.email. Trigger below pins email to auth.users.email
--     (admins bypass for support corrections).
--
-- G3. SUPERSEDED by 20261017_converge_enrollments.sql: the enrollments
--     table no longer has a status column, so this policy is skipped when
--     the column is absent (kept conditional so reruns never crash).

-- ============ G1: notifications — is_read flips only ============
create or replace function lock_notification_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if is_admin() then return new; end if;
  if old.user_id is distinct from new.user_id
     or old.title is distinct from new.title
     or old.message is distinct from new.message then
    raise exception 'only read-state may change';
  end if;
  return new;
end $$;

drop trigger if exists trg_lock_notification_update on notifications;
create trigger trg_lock_notification_update before update on notifications
for each row execute function lock_notification_update();

-- ============ G2: profiles.email pinned to auth email ============
create or replace function lock_email_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_auth_email text;
begin
  if is_admin() then return new; end if;
  if old.email is not distinct from new.email then return new; end if;
  select email into v_auth_email from auth.users where id = new.id;
  if v_auth_email is null or new.email is distinct from v_auth_email::citext then
    raise exception 'email must match account email';
  end if;
  return new;
end $$;

drop trigger if exists trg_lock_email_change on profiles;
create trigger trg_lock_email_change before update of email on profiles
for each row execute function lock_email_change();

-- ============ G3: skipped unless the legacy status column exists ============
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'enrollments' and column_name = 'status'
  ) then
    drop policy if exists "cancel own pending enrollment" on enrollments;
    create policy "cancel own pending enrollment" on enrollments for delete
    using (user_id = auth.uid() and status = 'pending');
  else
    drop policy if exists "cancel own pending enrollment" on enrollments;
  end if;
end $$;
