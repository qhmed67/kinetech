import { useEffect, useState } from "react";
import { useLang } from "../components/lang";
import { Section } from "./ui";
import { apiFetch } from "../lib/http";
import { getAccessToken } from "../lib/accessToken";

type WorkerSetting = {
  enabled: boolean;
  updated_at: string | null;
  updated_by: string | null;
  updated_by_name: string | null;
  missing: boolean;
};

type GateSetting = {
  gate_enabled: boolean;
  min_supported_version: string;
  force_update: boolean;
  message_ar: string;
  message_en: string;
  updated_at: string | null;
  updated_by: string | null;
  updated_by_name: string | null;
  missing: boolean;
};

const EMPTY_GATE: GateSetting = {
  gate_enabled: true,
  min_supported_version: "0.0.0",
  force_update: false,
  message_ar: "",
  message_en: "",
  updated_at: null,
  updated_by: null,
  updated_by_name: null,
  missing: false,
};

/** A simple on/off runtime flag (Worker tier, Direct tier). */
type ToggleSetting = {
  enabled: boolean;
  updated_at: string | null;
  updated_by: string | null;
  updated_by_name: string | null;
  missing: boolean;
};

const EMPTY_TOGGLE: ToggleSetting = {
  enabled: true,
  updated_at: null,
  updated_by: null,
  updated_by_name: null,
  missing: false,
};

/** Concurrent session / device limit — the shape stored in app_settings. */
type LimitsSetting = {
  mode: "log" | "enforce";
  max_concurrent_sessions: number;
  max_concurrent_devices: number;
  heartbeat_ttl_minutes: number;
  ip_binding: boolean;
  updated_at: string | null;
  updated_by: string | null;
  updated_by_name: string | null;
  missing: boolean;
};

const EMPTY_LIMITS: LimitsSetting = {
  mode: "log",
  max_concurrent_sessions: 2,
  max_concurrent_devices: 3,
  heartbeat_ttl_minutes: 30,
  ip_binding: false,
  updated_at: null,
  updated_by: null,
  updated_by_name: null,
  missing: false,
};

/** Lifetime of a Worker stream grant (the window a copied URL stays usable). */
type TtlSetting = {
  seconds: number;
  updated_at: string | null;
  updated_by: string | null;
  updated_by_name: string | null;
  missing: boolean;
};

const EMPTY_TTL: TtlSetting = {
  seconds: 3600,
  updated_at: null,
  updated_by: null,
  updated_by_name: null,
  missing: false,
};

function num(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

export function Settings() {
  const { t } = useLang();
  const s = t.admin.settings;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [setting, setSetting] = useState<WorkerSetting | null>(null);

  // Native version gate — draft state (edited locally, saved as one row).
  const [gateLoading, setGateLoading] = useState(true);
  const [gateSaving, setGateSaving] = useState(false);
  const [gateError, setGateError] = useState("");
  const [gate, setGate] = useState<GateSetting>(EMPTY_GATE);

  // Direct Drive tier, session limits and stream-token lifetime (Task 3).
  const [directLoading, setDirectLoading] = useState(true);
  const [directSaving, setDirectSaving] = useState(false);
  const [direct, setDirect] = useState<ToggleSetting>(EMPTY_TOGGLE);
  const [limitsLoading, setLimitsLoading] = useState(true);
  const [limitsSaving, setLimitsSaving] = useState(false);
  const [limits, setLimits] = useState<LimitsSetting>(EMPTY_LIMITS);
  const [ttlLoading, setTtlLoading] = useState(true);
  const [ttlSaving, setTtlSaving] = useState(false);
  const [ttl, setTtl] = useState<TtlSetting>(EMPTY_TTL);
  const [extraError, setExtraError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) { if (alive) { setError(s.loadError); setLoading(false); } return; }
        const r = await apiFetch("/api/admin/app-settings?key=video_worker_enabled", {
          headers: { authorization: `Bearer ${token}` },
        });
        const body = (await r.json().catch(() => null)) as any;
        if (!alive) return;
        if (!r.ok || !body?.ok) {
          setError(body?.en || s.loadError);
          return;
        }
        const value = body.value && typeof body.value === "object" ? body.value : {};
        setSetting({
          enabled: value.enabled !== false,
          updated_at: typeof body.updated_at === "string" ? body.updated_at : null,
          updated_by: typeof body.updated_by === "string" ? body.updated_by : null,
          updated_by_name: typeof body.updated_by_name === "string" ? body.updated_by_name : null,
          missing: body.missing === true,
        });
      } catch {
        if (alive) setError(s.loadError);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [s.loadError]);

  // Load the native gate row (separate request: one key per call).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) { if (alive) setGateLoading(false); return; }
        const r = await apiFetch("/api/admin/app-settings?key=native_gate", {
          headers: { authorization: `Bearer ${token}` },
        });
        const body = (await r.json().catch(() => null)) as any;
        if (!alive) return;
        if (!r.ok || !body?.ok) {
          setGateError(body?.en || s.loadError);
          return;
        }
        const value = body.value && typeof body.value === "object" ? body.value : {};
        setGate({
          gate_enabled: value.gate_enabled !== false,
          min_supported_version:
            typeof value.min_supported_version === "string" ? value.min_supported_version : "0.0.0",
          force_update: value.force_update === true,
          message_ar: typeof value.message_ar === "string" ? value.message_ar : "",
          message_en: typeof value.message_en === "string" ? value.message_en : "",
          updated_at: typeof body.updated_at === "string" ? body.updated_at : null,
          updated_by: typeof body.updated_by === "string" ? body.updated_by : null,
          updated_by_name: typeof body.updated_by_name === "string" ? body.updated_by_name : null,
          missing: body.missing === true,
        });
      } catch {
        if (alive) setGateError(s.loadError);
      } finally {
        if (alive) setGateLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [s.loadError]);

  // Load the three Task 3 rows in one go (one request per key).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) {
          if (alive) { setDirectLoading(false); setLimitsLoading(false); setTtlLoading(false); }
          return;
        }
        const read = async (key: string) => {
          const r = await apiFetch(`/api/admin/app-settings?key=${key}`, {
            headers: { authorization: `Bearer ${token}` },
          });
          const body = (await r.json().catch(() => null)) as any;
          if (!r.ok || !body?.ok) return null;
          return body;
        };
        const [directBody, limitsBody, ttlBody] = await Promise.all([
          read("direct_drive_enabled"),
          read("session_limits"),
          read("stream_token_ttl_seconds"),
        ]);
        if (!alive) return;
        if (directBody) {
          const value = directBody.value && typeof directBody.value === "object" ? directBody.value : {};
          setDirect({
            enabled: value.enabled !== false,
            updated_at: typeof directBody.updated_at === "string" ? directBody.updated_at : null,
            updated_by: typeof directBody.updated_by === "string" ? directBody.updated_by : null,
            updated_by_name: typeof directBody.updated_by_name === "string" ? directBody.updated_by_name : null,
            missing: directBody.missing === true,
          });
        }
        if (limitsBody) {
          const value = limitsBody.value && typeof limitsBody.value === "object" ? limitsBody.value : {};
          setLimits({
            mode: value.mode === "enforce" ? "enforce" : "log",
            max_concurrent_sessions: num(value.max_concurrent_sessions, EMPTY_LIMITS.max_concurrent_sessions),
            max_concurrent_devices: num(value.max_concurrent_devices, EMPTY_LIMITS.max_concurrent_devices),
            heartbeat_ttl_minutes: num(value.heartbeat_ttl_minutes, EMPTY_LIMITS.heartbeat_ttl_minutes),
            ip_binding: value.ip_binding === true,
            updated_at: typeof limitsBody.updated_at === "string" ? limitsBody.updated_at : null,
            updated_by: typeof limitsBody.updated_by === "string" ? limitsBody.updated_by : null,
            updated_by_name: typeof limitsBody.updated_by_name === "string" ? limitsBody.updated_by_name : null,
            missing: limitsBody.missing === true,
          });
        }
        if (ttlBody) {
          const value = ttlBody.value && typeof ttlBody.value === "object" ? ttlBody.value : {};
          setTtl({
            seconds: num(value.seconds, EMPTY_TTL.seconds),
            updated_at: typeof ttlBody.updated_at === "string" ? ttlBody.updated_at : null,
            updated_by: typeof ttlBody.updated_by === "string" ? ttlBody.updated_by : null,
            updated_by_name: typeof ttlBody.updated_by_name === "string" ? ttlBody.updated_by_name : null,
            missing: ttlBody.missing === true,
          });
        }
      } catch {
        if (alive) setExtraError(s.loadError);
      } finally {
        if (alive) { setDirectLoading(false); setLimitsLoading(false); setTtlLoading(false); }
      }
    })();
    return () => { alive = false; };
  }, [s.loadError]);

  const toggle = async () => {
    if (!setting || saving) return;
    const next = !setting.enabled;
    const msg = next ? s.workerConfirmOn : s.workerConfirmOff;
    if (!window.confirm(msg)) return;
    setSaving(true);
    setError("");
    try {
      const token = await getAccessToken();
      if (!token) { setError(s.saveError); return; }
      const r = await apiFetch("/api/admin/app-settings", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ key: "video_worker_enabled", value: { enabled: next } }),
      });
      const body = (await r.json().catch(() => null)) as any;
      if (!r.ok || !body?.ok) {
        setError(body?.en || s.saveError);
        return;
      }
      const value = body.value && typeof body.value === "object" ? body.value : {};
      setSetting({
        enabled: value.enabled !== false,
        updated_at: typeof body.updated_at === "string" ? body.updated_at : null,
        updated_by: typeof body.updated_by === "string" ? body.updated_by : null,
        updated_by_name: typeof body.updated_by_name === "string" ? body.updated_by_name : null,
        missing: false,
      });
    } catch {
      setError(s.saveError);
    } finally {
      setSaving(false);
    }
  };

  const saveGate = async () => {
    if (gateSaving) return;
    const version = gate.min_supported_version.trim();
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
      setGateError(s.minVersionInvalid);
      return;
    }
    if (!window.confirm(s.gateConfirm)) return;
    setGateSaving(true);
    setGateError("");
    try {
      const token = await getAccessToken();
      if (!token) { setGateError(s.saveError); return; }
      const r = await apiFetch("/api/admin/app-settings", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          key: "native_gate",
          value: {
            gate_enabled: gate.gate_enabled,
            min_supported_version: version,
            force_update: gate.force_update,
            message_ar: gate.message_ar,
            message_en: gate.message_en,
          },
        }),
      });
      const body = (await r.json().catch(() => null)) as any;
      if (!r.ok || !body?.ok) {
        setGateError(body?.en || s.saveError);
        return;
      }
      const value = body.value && typeof body.value === "object" ? body.value : {};
      setGate((g) => ({
        ...g,
        gate_enabled: value.gate_enabled !== false,
        min_supported_version:
          typeof value.min_supported_version === "string" ? value.min_supported_version : version,
        force_update: value.force_update === true,
        message_ar: typeof value.message_ar === "string" ? value.message_ar : g.message_ar,
        message_en: typeof value.message_en === "string" ? value.message_en : g.message_en,
        updated_at: typeof body.updated_at === "string" ? body.updated_at : null,
        updated_by: typeof body.updated_by === "string" ? body.updated_by : null,
        updated_by_name: typeof body.updated_by_name === "string" ? body.updated_by_name : null,
        missing: false,
      }));
    } catch {
      setGateError(s.saveError);
    } finally {
      setGateSaving(false);
    }
  };

  const saveDirect = async (next: boolean) => {
    if (directSaving) return;
    if (!window.confirm(next ? s.directConfirmOn : s.directConfirmOff)) return;
    setDirectSaving(true);
    setExtraError("");
    try {
      const token = await getAccessToken();
      if (!token) { setExtraError(s.saveError); return; }
      const r = await apiFetch("/api/admin/app-settings", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ key: "direct_drive_enabled", value: { enabled: next } }),
      });
      const body = (await r.json().catch(() => null)) as any;
      if (!r.ok || !body?.ok) { setExtraError(body?.en || s.saveError); return; }
      const value = body.value && typeof body.value === "object" ? body.value : {};
      setDirect((d) => ({
        ...d,
        enabled: value.enabled !== false,
        updated_at: typeof body.updated_at === "string" ? body.updated_at : null,
        updated_by: typeof body.updated_by === "string" ? body.updated_by : null,
        updated_by_name: typeof body.updated_by_name === "string" ? body.updated_by_name : null,
        missing: false,
      }));
    } catch {
      setExtraError(s.saveError);
    } finally {
      setDirectSaving(false);
    }
  };

  const saveLimits = async () => {
    if (limitsSaving) return;
    if (!window.confirm(s.limitsConfirm)) return;
    setLimitsSaving(true);
    setExtraError("");
    try {
      const token = await getAccessToken();
      if (!token) { setExtraError(s.saveError); return; }
      const r = await apiFetch("/api/admin/app-settings", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          key: "session_limits",
          value: {
            mode: limits.mode,
            max_concurrent_sessions: limits.max_concurrent_sessions,
            max_concurrent_devices: limits.max_concurrent_devices,
            heartbeat_ttl_minutes: limits.heartbeat_ttl_minutes,
            ip_binding: limits.ip_binding,
          },
        }),
      });
      const body = (await r.json().catch(() => null)) as any;
      if (!r.ok || !body?.ok) { setExtraError(body?.en || s.saveError); return; }
      const value = body.value && typeof body.value === "object" ? body.value : {};
      setLimits((l) => ({
        ...l,
        mode: value.mode === "enforce" ? "enforce" : "log",
        max_concurrent_sessions: num(value.max_concurrent_sessions, l.max_concurrent_sessions),
        max_concurrent_devices: num(value.max_concurrent_devices, l.max_concurrent_devices),
        heartbeat_ttl_minutes: num(value.heartbeat_ttl_minutes, l.heartbeat_ttl_minutes),
        ip_binding: value.ip_binding === true,
        updated_at: typeof body.updated_at === "string" ? body.updated_at : null,
        updated_by: typeof body.updated_by === "string" ? body.updated_by : null,
        updated_by_name: typeof body.updated_by_name === "string" ? body.updated_by_name : null,
        missing: false,
      }));
    } catch {
      setExtraError(s.saveError);
    } finally {
      setLimitsSaving(false);
    }
  };

  const saveTtl = async () => {
    if (ttlSaving) return;
    if (!window.confirm(s.ttlConfirm)) return;
    setTtlSaving(true);
    setExtraError("");
    try {
      const token = await getAccessToken();
      if (!token) { setExtraError(s.saveError); return; }
      const r = await apiFetch("/api/admin/app-settings", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ key: "stream_token_ttl_seconds", value: { seconds: ttl.seconds } }),
      });
      const body = (await r.json().catch(() => null)) as any;
      if (!r.ok || !body?.ok) { setExtraError(body?.en || s.saveError); return; }
      const value = body.value && typeof body.value === "object" ? body.value : {};
      setTtl((t) => ({
        ...t,
        seconds: num(value.seconds, t.seconds),
        updated_at: typeof body.updated_at === "string" ? body.updated_at : null,
        updated_by: typeof body.updated_by === "string" ? body.updated_by : null,
        updated_by_name: typeof body.updated_by_name === "string" ? body.updated_by_name : null,
        missing: false,
      }));
    } catch {
      setExtraError(s.saveError);
    } finally {
      setTtlSaving(false);
    }
  };

  const changedAt = (updated_at: string | null, updated_by: string | null, updated_by_name: string | null) => {
    if (!updated_at) return s.never;
    const when = new Date(updated_at);
    const whenText = Number.isNaN(when.getTime()) ? updated_at : when.toLocaleString();
    const who = updated_by_name || updated_by || "";
    return who ? `${whenText} (${s.by} ${who})` : whenText;
  };

  const lastChanged = (() => {
    if (!setting?.updated_at) return s.never;
    const when = new Date(setting.updated_at);
    const whenText = Number.isNaN(when.getTime()) ? setting.updated_at : when.toLocaleString();
    const who = setting.updated_by_name || setting.updated_by || "";
    return who ? `${whenText} (${s.by} ${who})` : whenText;
  })();

  const gateLastChanged = (() => {
    if (!gate.updated_at) return s.never;
    const when = new Date(gate.updated_at);
    const whenText = Number.isNaN(when.getTime()) ? gate.updated_at : when.toLocaleString();
    const who = gate.updated_by_name || gate.updated_by || "";
    return who ? `${whenText} (${s.by} ${who})` : whenText;
  })();

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>{s.title}</h1>

      <Section title={s.workerTitle}>
        <p className="text-sm" style={{ color: "var(--muted)" }}>{s.workerDesc}</p>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={setting?.enabled === true}
            onClick={() => void toggle()}
            disabled={loading || saving || !setting}
            className="rounded-full border px-5 py-2.5 text-sm font-bold transition-colors disabled:opacity-50"
            style={setting?.enabled
              ? { background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" }
              : { background: "#fff", color: "var(--muted)", borderColor: "var(--border)" }}
          >
            {saving ? s.saving : setting?.enabled ? s.workerEnabled : s.workerDisabled}
          </button>
          {loading && <span className="text-sm" style={{ color: "var(--muted)" }}>…</span>}
        </div>

        <div className="grid gap-1 text-sm" style={{ color: "var(--muted)" }}>
          <p><strong>{s.lastChanged}:</strong> {loading ? "…" : lastChanged}</p>
          <p>{s.ttlHint}</p>
          <p>{s.failSafe}</p>
        </div>

        {error && <p role="alert" className="text-sm font-bold" style={{ color: "#B3261E" }}>{error}</p>}
      </Section>

      <Section title={s.gateTitle}>
        <p className="text-sm" style={{ color: "var(--muted)" }}>{s.gateDesc}</p>

        <div className="grid gap-3">
          <label className="flex items-center gap-3 text-sm font-bold">
            <input
              type="checkbox"
              role="switch"
              checked={gate.gate_enabled}
              disabled={gateLoading || gateSaving}
              onChange={(e) => {
                const next = e.target.checked;
                const msg = next ? s.gateKillSwitchOn : s.gateKillSwitchOff;
                if (!window.confirm(msg)) return;
                setGate((g) => ({ ...g, gate_enabled: next }));
              }}
            />
            {gate.gate_enabled ? s.gateEnabled : s.gateDisabled}
          </label>

          <label className="flex items-center gap-3 text-sm font-bold">
            <input
              type="checkbox"
              role="switch"
              checked={gate.force_update}
              disabled={gateLoading || gateSaving}
              onChange={(e) => setGate((g) => ({ ...g, force_update: e.target.checked }))}
            />
            {s.forceUpdate}
          </label>
          <p className="text-sm" style={{ color: "var(--muted)" }}>{s.forceUpdateDesc}</p>

          <label className="grid gap-1 text-sm font-bold">
            {s.minVersion}
            <input
              type="text"
              inputMode="decimal"
              placeholder={s.minVersionPh}
              value={gate.min_supported_version}
              disabled={gateLoading || gateSaving}
              onChange={(e) => setGate((g) => ({ ...g, min_supported_version: e.target.value }))}
              className="rounded-lg border px-3 py-2 text-sm font-normal"
              style={{ borderColor: "var(--border)" }}
            />
          </label>
          <p className="text-sm" style={{ color: "var(--muted)" }}>{s.minVersionHint}</p>

          <label className="grid gap-1 text-sm font-bold">
            {s.gateMessageAr}
            <input
              type="text"
              dir="rtl"
              value={gate.message_ar}
              disabled={gateLoading || gateSaving}
              onChange={(e) => setGate((g) => ({ ...g, message_ar: e.target.value }))}
              className="rounded-lg border px-3 py-2 text-sm font-normal"
              style={{ borderColor: "var(--border)" }}
            />
          </label>

          <label className="grid gap-1 text-sm font-bold">
            {s.gateMessageEn}
            <input
              type="text"
              dir="ltr"
              value={gate.message_en}
              disabled={gateLoading || gateSaving}
              onChange={(e) => setGate((g) => ({ ...g, message_en: e.target.value }))}
              className="rounded-lg border px-3 py-2 text-sm font-normal"
              style={{ borderColor: "var(--border)" }}
            />
          </label>
          <p className="text-sm" style={{ color: "var(--muted)" }}>{s.gateMessageHint}</p>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void saveGate()}
              disabled={gateLoading || gateSaving}
              className="rounded-full border px-5 py-2.5 text-sm font-bold transition-colors disabled:opacity-50"
              style={{ background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" }}
            >
              {gateSaving ? s.saving : s.gateSubmit}
            </button>
            {gateLoading && <span className="text-sm" style={{ color: "var(--muted)" }}>…</span>}
          </div>

          <div className="grid gap-1 text-sm" style={{ color: "var(--muted)" }}>
            <p><strong>{s.lastChanged}:</strong> {gateLoading ? "…" : gateLastChanged}</p>
            <p>{s.gateFailSafe}</p>
          </div>
        </div>

        {gateError && <p role="alert" className="text-sm font-bold" style={{ color: "#B3261E" }}>{gateError}</p>}
      </Section>

      <Section title={s.directTitle}>
        <p className="text-sm" style={{ color: "var(--muted)" }}>{s.directDesc}</p>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={direct.enabled === true}
            onClick={() => void saveDirect(!direct.enabled)}
            disabled={directLoading || directSaving}
            className="rounded-full border px-5 py-2.5 text-sm font-bold transition-colors disabled:opacity-50"
            style={direct.enabled
              ? { background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" }
              : { background: "#fff", color: "var(--muted)", borderColor: "var(--border)" }}
          >
            {directSaving ? s.saving : direct.enabled ? s.directEnabled : s.directDisabled}
          </button>
          {directLoading && <span className="text-sm" style={{ color: "var(--muted)" }}>…</span>}
        </div>

        <div className="grid gap-1 text-sm" style={{ color: "var(--muted)" }}>
          <p><strong>{s.lastChanged}:</strong> {directLoading ? "…" : changedAt(direct.updated_at, direct.updated_by, direct.updated_by_name)}</p>
          <p>{s.ttlHint}</p>
          <p>{s.failSafe}</p>
        </div>
      </Section>

      <Section title={s.limitsTitle}>
        <p className="text-sm" style={{ color: "var(--muted)" }}>{s.limitsDesc}</p>

        <div className="grid gap-3">
          <label className="grid gap-1 text-sm font-bold">
            {s.limitsMode}
            <select
              value={limits.mode}
              disabled={limitsLoading || limitsSaving}
              onChange={(e) => setLimits((l) => ({ ...l, mode: e.target.value === "enforce" ? "enforce" : "log" }))}
              className="rounded-lg border px-3 py-2 text-sm font-normal"
              style={{ borderColor: "var(--border)" }}
            >
              <option value="log">{s.limitsModeLog}</option>
              <option value="enforce">{s.limitsModeEnforce}</option>
            </select>
          </label>
          <p className="text-sm" style={{ color: "var(--muted)" }}>{s.limitsModeHint}</p>

          <label className="grid gap-1 text-sm font-bold">
            {s.limitsSessions}
            <input
              type="number"
              min={1}
              value={limits.max_concurrent_sessions}
              disabled={limitsLoading || limitsSaving}
              onChange={(e) => setLimits((l) => ({ ...l, max_concurrent_sessions: num(e.target.value, l.max_concurrent_sessions) }))}
              className="rounded-lg border px-3 py-2 text-sm font-normal"
              style={{ borderColor: "var(--border)" }}
            />
          </label>

          <label className="grid gap-1 text-sm font-bold">
            {s.limitsDevices}
            <input
              type="number"
              min={1}
              value={limits.max_concurrent_devices}
              disabled={limitsLoading || limitsSaving}
              onChange={(e) => setLimits((l) => ({ ...l, max_concurrent_devices: num(e.target.value, l.max_concurrent_devices) }))}
              className="rounded-lg border px-3 py-2 text-sm font-normal"
              style={{ borderColor: "var(--border)" }}
            />
          </label>

          <label className="grid gap-1 text-sm font-bold">
            {s.limitsTtl}
            <input
              type="number"
              min={5}
              value={limits.heartbeat_ttl_minutes}
              disabled={limitsLoading || limitsSaving}
              onChange={(e) => setLimits((l) => ({ ...l, heartbeat_ttl_minutes: num(e.target.value, l.heartbeat_ttl_minutes) }))}
              className="rounded-lg border px-3 py-2 text-sm font-normal"
              style={{ borderColor: "var(--border)" }}
            />
          </label>
          <p className="text-sm" style={{ color: "var(--muted)" }}>{s.limitsTtlHint}</p>

          <label className="flex items-center gap-3 text-sm font-bold">
            <input
              type="checkbox"
              role="switch"
              checked={limits.ip_binding}
              disabled={limitsLoading || limitsSaving}
              onChange={(e) => setLimits((l) => ({ ...l, ip_binding: e.target.checked }))}
            />
            {s.limitsIp}
          </label>
          <p className="text-sm" style={{ color: "var(--muted)" }}>{s.limitsIpHint}</p>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void saveLimits()}
              disabled={limitsLoading || limitsSaving}
              className="rounded-full border px-5 py-2.5 text-sm font-bold transition-colors disabled:opacity-50"
              style={{ background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" }}
            >
              {limitsSaving ? s.saving : s.limitsSubmit}
            </button>
            {limitsLoading && <span className="text-sm" style={{ color: "var(--muted)" }}>…</span>}
          </div>

          <div className="grid gap-1 text-sm" style={{ color: "var(--muted)" }}>
            <p><strong>{s.lastChanged}:</strong> {limitsLoading ? "…" : changedAt(limits.updated_at, limits.updated_by, limits.updated_by_name)}</p>
            <p>{s.limitsFailSafe}</p>
          </div>
        </div>
      </Section>

      <Section title={s.ttlTitle}>
        <p className="text-sm" style={{ color: "var(--muted)" }}>{s.ttlDesc}</p>

        <div className="grid gap-3">
          <label className="grid gap-1 text-sm font-bold">
            {s.ttlSeconds}
            <input
              type="number"
              min={300}
              max={7200}
              step={60}
              value={ttl.seconds}
              disabled={ttlLoading || ttlSaving}
              onChange={(e) => setTtl((t) => ({ ...t, seconds: num(e.target.value, t.seconds) }))}
              className="rounded-lg border px-3 py-2 text-sm font-normal"
              style={{ borderColor: "var(--border)" }}
            />
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void saveTtl()}
              disabled={ttlLoading || ttlSaving}
              className="rounded-full border px-5 py-2.5 text-sm font-bold transition-colors disabled:opacity-50"
              style={{ background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" }}
            >
              {ttlSaving ? s.saving : s.ttlSubmit}
            </button>
            {ttlLoading && <span className="text-sm" style={{ color: "var(--muted)" }}>…</span>}
          </div>

          <div className="grid gap-1 text-sm" style={{ color: "var(--muted)" }}>
            <p><strong>{s.lastChanged}:</strong> {ttlLoading ? "…" : changedAt(ttl.updated_at, ttl.updated_by, ttl.updated_by_name)}</p>
          </div>
        </div>
      </Section>

      {extraError && <p role="alert" className="text-sm font-bold" style={{ color: "#B3261E" }}>{extraError}</p>}
    </div>
  );
}
