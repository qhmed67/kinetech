-- Native app version gate (Task 2).
-- Additive/idempotent: seeds default app_settings row only.
-- Safe defaults: gate enabled but min version 0.0.0 and force_update false, so no clients are blocked.
-- Admin raises min_supported_version from the dashboard after a new native build is released.
INSERT INTO public.app_settings (key, value, updated_by)
VALUES (
  'native_gate',
  jsonb_build_object(
    'gate_enabled', true,
    'min_supported_version', '0.0.0',
    'force_update', false,
    'message_ar', '',
    'message_en', ''
  ),
  NULL
)
ON CONFLICT (key) DO NOTHING;
