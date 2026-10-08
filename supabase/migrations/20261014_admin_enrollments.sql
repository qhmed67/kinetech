-- KineTech admin-managed enrollments — run AFTER 20261013_drop_enrollments.sql
--
-- Enrollment is granted manually by admins (WhatsApp payment verification),
-- never self-requested. This migration:
--   1. Enforces uniqueness on national_id + phone (email already unique).
--      NULLs are exempt (Postgres treats NULLs as distinct) — only real
--      duplicates are rejected.
--   2. Adds profiles.banned for suspend/unsuspend.
--   3. Recreates enrollments as an ADMIN-WRITTEN grant table:
--      users read their own rows; only admins insert/delete.
--      (The old self-request flow + its policies are gone with the old table.)

-- ============ 1. uniqueness (idempotent) ============
do $$ begin
  alter table profiles add constraint profiles_national_id_unique unique (national_id);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table profiles add constraint profiles_phone_unique unique (phone);
exception when duplicate_object then null; end $$;

-- ============ 2. ban flag ============
alter table profiles add column if not exists banned boolean not null default false;

-- ============ 3. admin-granted enrollments ============
create table if not exists enrollments (
  user_id uuid not null references profiles(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (user_id, course_id)
);

create index if not exists idx_enroll_course on enrollments (course_id);

alter table enrollments enable row level security;

-- users read their own grants (dashboard + watch gating)
drop policy if exists "read own enrollments" on enrollments;
create policy "read own enrollments" on enrollments for select
using (user_id = auth.uid() or is_admin());

-- grants and revocations are admin-only: no user insert/update/delete path
drop policy if exists "admin manage enrollments" on enrollments;
create policy "admin manage enrollments" on enrollments for all
using (is_admin()) with check (is_admin());
