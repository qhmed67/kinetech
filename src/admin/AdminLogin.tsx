import { useEffect, useState } from "react";
import { useLang } from "../components/lang";
import { Field, Text } from "./ui";
import { isSupabaseConfigured } from "../lib/db/env";
import { checkAdmin } from "../lib/db/adminGuard";
import { throttle } from "../lib/db/throttle";

export function AdminLogin() {
  const { t, toggle } = useLang();
  const a = t.admin;
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    if (isSupabaseConfigured()) {
      void checkAdmin().then((ok) => {
        if (alive && ok) window.location.hash = "#/admin/dashboard";
      });
    }
    return () => {
      alive = false;
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !throttle("admin-login", 3000)) return;
    setErr(false);
    if (!isSupabaseConfigured()) {
      // No backdoor: without Supabase there is no admin auth at all.
      setErr(true);
      return;
    }
    setBusy(true);
    try {
      const { signInWithDb } = await import("../auth");
      await signInWithDb(u.trim(), p);
      if (await checkAdmin()) window.location.hash = "#/admin/dashboard";
      else setErr(true);
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main id="content" className="section">
      <div className="kt-wrap" style={{ maxWidth: 440 }}>
        <div className="rounded-[24px] border bg-white p-8" style={{ borderColor: "var(--kt-line)" }}>
          <p
            className="inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.12em]"
            style={{ background: "var(--kt-deep)", color: "#fff", fontFamily: "var(--font-display)" }}
          >
            {a.dashT}
          </p>
          <h1 className="mt-3 text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
            {a.loginT}
          </h1>
          <button
            type="button"
            onClick={toggle}
            aria-label="Switch language"
            className="mt-2 text-sm font-bold"
            style={{ color: "var(--accent)" }}
          >
            {t.toggle}
          </button>
          <form
            className="mt-6 grid gap-4"
            onSubmit={submit}
          >
            <Field label={a.userL}>
              <Text value={u} onChange={(e) => setU(e.target.value)} autoComplete="username" dir="ltr" />
            </Field>
            <Field label={a.passL}>
              <Text type="password" value={p} onChange={(e) => setP(e.target.value)} autoComplete="current-password" dir="ltr" />
            </Field>
            {err && (
              <p role="alert" className="text-sm font-bold" style={{ color: "#B3261E" }}>
                {a.loginErr}
              </p>
            )}
            <button type="submit" className="btn btn-primary w-full" disabled={busy}>
              {a.loginBtn}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
