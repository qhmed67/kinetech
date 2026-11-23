-- ============ app_settings — server-side runtime flags (additive) ============
-- Stores small admin-controlled runtime settings. The Worker streaming tier
-- toggle lives here (key = 'video_worker_enabled').
--
-- Security model:
--   - RLS is ON with NO policies: anon/authenticated keys cannot read or write.
--   - The service-role key (server API routes only) reads/writes.
--   - Admin identity is verified server-side in API routes before any write;
--     every write records who/when/old->new in app_settings_audit.
--
-- Fail-safe: if the row is missing or a DB read fails, the application MUST
-- treat the Worker tier as ENABLED (current behavior). Do not lock students out
-- because of a settings read failure.
--
-- WHERE TO RUN: Supabase dashboard -> SQL Editor -> paste this file -> Run.
-- Additive/idempotent: safe to re-run.

create table if not exists app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

comment on table app_settings is
  'Server-side admin runtime settings. RLS on, no policies: service-role only.';
comment on column app_settings.key is 'Stable setting identifier, e.g. video_worker_enabled.';
comment on column app_settings.value is 'JSON value; shape is defined per key by the API layer.';

alter table app_settings enable row level security;
-- NO policies: service-role only (anon/auth cannot read or write).

create table if not exists app_settings_audit (
  id bigint generated always as identity primary key,
  key text not null,
  old_value jsonb,
  new_value jsonb not null,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  source text not null default 'admin-api'
);

comment on table app_settings_audit is
  'Audit trail for app_settings writes (who/when/old->new). Service-role only.';

alter table app_settings_audit enable row level security;
-- NO policies: service-role only.

create index if not exists app_settings_audit_key_changed_at_idx
  on app_settings_audit (key, changed_at desc);

-- Default: Worker tier enabled (current behavior). Missing row is treated the
-- same way by the application, but inserting the row makes the state explicit.
insert into app_settings (key, value, updated_at)
values ('video_worker_enabled', '{"enabled": true}'::jsonb, now())
on conflict (key) do nothing;
