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

export function Settings() {
  const { t } = useLang();
  const s = t.admin.settings;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [setting, setSetting] = useState<WorkerSetting | null>(null);

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

  const lastChanged = (() => {
    if (!setting?.updated_at) return s.never;
    const when = new Date(setting.updated_at);
    const whenText = Number.isNaN(when.getTime()) ? setting.updated_at : when.toLocaleString();
    const who = setting.updated_by_name || setting.updated_by || "";
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
    </div>
  );
}
