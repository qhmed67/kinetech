-- KineTech activity tables — run AFTER 20261010_rpc_guards.sql
-- Per-user upcoming sessions + notifications for the dashboard overview.
-- Users read only their own rows; may mark their own notifications read.
-- Admins manage all rows (scheduling + broadcasting).

create table if not exists upcoming_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  date timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  message text not null default '',
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_sessions_user_date on upcoming_sessions (user_id, date);
create index if not exists idx_notif_user_created on notifications (user_id, created_at desc);
create index if not exists idx_notif_user_unread on notifications (user_id) where not is_read;

alter table upcoming_sessions enable row level security;
alter table notifications enable row level security;

-- users view only their own records
drop policy if exists "read own sessions" on upcoming_sessions;
create policy "read own sessions" on upcoming_sessions for select
using (user_id = auth.uid() or is_admin());

drop policy if exists "read own notifications" on notifications;
create policy "read own notifications" on notifications for select
using (user_id = auth.uid() or is_admin());

-- users may mark their own notifications read (nothing else writable)
drop policy if exists "mark own notifications read" on notifications;
create policy "mark own notifications read" on notifications for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- admins schedule sessions + broadcast notifications
drop policy if exists "admin manage sessions" on upcoming_sessions;
create policy "admin manage sessions" on upcoming_sessions for all
using (is_admin()) with check (is_admin());

drop policy if exists "admin manage notifications" on notifications;
create policy "admin manage notifications" on notifications for all
using (is_admin()) with check (is_admin());
