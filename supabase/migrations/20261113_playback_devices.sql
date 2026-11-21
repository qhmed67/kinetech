-- ============ playback_devices — which devices may play ============
-- The native app binds every playback to a device id (a uuid generated on the
-- device and kept in the keystore). This table records the devices that
-- played for an account, so the server can enforce a small device limit
-- (2 concurrent devices by default) instead of letting one account share
-- itself around.
--
-- Additive only: nothing existing changes, and the app keeps working if the
-- table is missing (the server logs it and skips the limit).

create table if not exists playback_devices (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  last_seen timestamptz not null default now(),
  primary key (user_id, device_id)
);

alter table playback_devices enable row level security;
-- NO policies: only the service-role key (the Vercel function) touches it.

create index if not exists playback_devices_user_seen_idx
  on playback_devices (user_id, last_seen desc);
