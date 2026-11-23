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
    </div>
  );
}
