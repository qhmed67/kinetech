import { useState } from "react";
import { adminLogin, isAdmin } from "../store";
import { useLang } from "../components/lang";
import { Field, Text } from "./ui";

export function AdminLogin() {
  const { t, toggle } = useLang();
  const a = t.admin;
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState(false);

  if (isAdmin()) {
    window.location.hash = "#/admin/dashboard";
    return null;
  }

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
            onSubmit={(e) => {
              e.preventDefault();
              if (adminLogin(u, p)) window.location.hash = "#/admin/dashboard";
              else setErr(true);
            }}
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
            <button type="submit" className="btn btn-primary w-full">
              {a.loginBtn}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
