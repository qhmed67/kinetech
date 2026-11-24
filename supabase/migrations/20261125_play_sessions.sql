-- ============ Task 3: heartbeat sessions, session limits, tier toggles ============
-- Goal: make a copied media URL (and a shared account) as useless as possible
-- on FREE infrastructure (Supabase + Vercel + Cloudflare, no paid services).
--
-- Three new things, all additive and idempotent:
--   1. play_sessions          — heartbeat rows for the concurrent session/device
--                               limit (a session with no heartbeat is DEAD and
--                               stops counting; no lockouts from a crashed app).
--   2. app_settings rows      — session_limits (log-only by default),
--                               direct_drive_enabled (Direct tier switch),
--                               stream_token_ttl_seconds (stream token lifetime).
--   3. Nothing existing is touched: no column changes, no policy changes, no
--      deletes, no renames. Re-running this file is a no-op.
--
-- WHERE TO RUN: Supabase dashboard -> SQL Editor -> paste -> Run. It is also
-- safe to apply on a preview that shares the production database.

-- ---------------------------------------------------------------------------
-- 1. play_sessions — one row per live session/device.
-- ---------------------------------------------------------------------------
create table if not exists play_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Opaque key of the caller: the auth session id (web) or the device id
  -- (native app). Never a secret.
  session_key text not null,
  -- Device id, when the caller sends one (native app only).
  device_id text,
  -- 'web' | 'native' — reporting only.
  kind text not null default 'web',
  -- Last seen IP. Stored so an optional IP binding can notice a session that
  -- suddenly appears from a different network. Never logged.
  ip text,
  user_agent text,
  -- THE HEARTBEAT: refreshed on every play request. A row whose last_seen is
  -- older than the TTL window is dead and does not count towards the limit.
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint play_sessions_key_unique unique (user_id, session_key)
);

alter table play_sessions enable row level security;
-- NO policies: only the service-role key (the Vercel functions) touches it.

create index if not exists play_sessions_user_seen_idx
  on play_sessions (user_id, last_seen desc);

comment on table public.play_sessions is
  'Heartbeat rows for the concurrent session/device limit. A session with no heartbeat inside the TTL window is dead and stops counting, so a crashed app or a shared phone cannot lock a student out.';

comment on column public.play_sessions.ip is
  'Last seen IP. Used only by the optional IP binding (off by default). Never logged and never returned to a client.';

-- ---------------------------------------------------------------------------
-- 2. app_settings seeds.
--
-- session_limits — concurrent session/device limit, LOG-ONLY by default.
--   mode                    'log' (default) | 'enforce'
--                           'log'     -> over-limit sessions are LOGGED and
--                                         recorded in watch_events, never
--                                         blocked. This is the shipped default
--                                         so a mis-set limit can never lock a
--                                         student out of their lessons.
--                           'enforce' -> over-limit sessions are refused with
--                                         TOO_MANY_SESSIONS / TOO_MANY_DEVICES.
--   max_concurrent_sessions  live sessions allowed at once (>= 1).
--   max_concurrent_devices   live devices allowed at once (>= 1).
--   heartbeat_ttl_minutes    a session with no heartbeat for this long is DEAD.
--                             Must be >= 5 so a slow page load or a brief
--                             network drop cannot expire a live session.
--   ip_binding        false (default) -> the IP is not checked at all. The
--                     heartbeat row is keyed by (user_id, session_key), so the
--                     same session from another network simply refreshes the
--                     same row and keeps counting as ONE live session.
--                     true  -> the same session_key seen from a different IP
--                     is a violation (logged, or refused when mode='enforce').
--                     DEFAULT OFF on purpose: mobile networks rotate the
--                     public IP mid-lesson, so binding would produce false
--                     positives for honest students on mobile data.
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value, updated_by)
values (
  'session_limits',
  jsonb_build_object(
    'mode', 'log',
    'max_concurrent_sessions', 2,
    'max_concurrent_devices', 3,
    'heartbeat_ttl_minutes', 30,
    'ip_binding', false
  ),
  null
)
on conflict (key) do nothing;

-- Direct Drive tier switch — same mechanism, same fail-safe direction as
-- 'video_worker_enabled': the row is the switch, the server reads it, the
-- admin API audits every change.
--   enabled=false -> /api/play never hands out the Drive file id + browser
--                    key (the "direct" fallback answers SYS_003 instead) and
--                    the client is told the Direct tier is unavailable.
--   enabled=true  -> current behaviour (default).
insert into public.app_settings (key, value, updated_by)
values ('direct_drive_enabled', jsonb_build_object('enabled', true), null)
on conflict (key) do nothing;

-- Lifetime of a Worker stream token (the signed ?t=... the browser carries).
-- The player renews it before expiry, so this is the window in which a
-- COPIED stream URL still works. Shorter = a copied URL dies sooner.
-- Clamped server-side to 300..7200 seconds; the default below matches the
-- previous hard-coded 3600.
insert into public.app_settings (key, value, updated_by)
values ('stream_token_ttl_seconds', jsonb_build_object('seconds', 3600), null)
on conflict (key) do nothing;
