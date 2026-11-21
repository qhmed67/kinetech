-- ============ app_logs — persisted structured logs ============
-- Logging standard: docs/LOGGING.md. One row per JSONL line. Only the
-- service-role key (Vercel functions) may read or write this table; RLS is on
-- with NO policies, so the anon/authenticated keys cannot touch it.
--
-- Additive only: nothing existing changes. If this migration has not been
-- applied, /api/log fails with SYS_002 and stdout logging keeps working.
--
-- Retention: Vercel runtime logs are short-lived, so keep 7 days here:
--   delete from app_logs where ts < now() - interval '7 days';
-- Run that from the Supabase SQL editor or a scheduled job.

create table if not exists app_logs (
  id bigint generated always as identity primary key,
  ts timestamptz not null,
  level text not null,
  service text not null,
  env text not null,
  version text not null,
  module text not null,
  event text not null,
  msg text not null,
  correlation_id text,
  user_id uuid,
  duration_ms integer,
  error jsonb,
  ctx jsonb
);

alter table app_logs enable row level security;
-- NO policies: service-role only.

create index if not exists app_logs_correlation_idx on app_logs (correlation_id);
create index if not exists app_logs_ts_idx on app_logs (ts desc);
create index if not exists app_logs_level_ts_idx on app_logs (level, ts desc);
create index if not exists app_logs_error_code_idx
  on app_logs ((error ->> 'code')) where error is not null;
