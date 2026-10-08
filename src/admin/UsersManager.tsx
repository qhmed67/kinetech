import { useState } from "react";
import { loadStore, useContent } from "../store";
import { useLang } from "../components/lang";
import {
  deleteProfile,
  grantEnrollment,
  revokeEnrollment,
  searchUser,
  setBanned,
  type FoundUser,
  type SearchKind,
} from "../lib/db/adminUsers";

/**
 * Admin user search + enrollment management.
 * Search runs ONLY on explicit submit (exact match, no scans, no wildcards).
 * All mutations are admin-gated server-side via RLS.
 */
export function UsersManager() {
  const { lang, t } = useLang();
  const u = t.admin.users;
  useContent();
  const courses = loadStore().courses;
  const [kind, setKind] = useState<SearchKind>("phone");
  const [term, setTerm] = useState("");
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const [found, setFound] = useState<FoundUser | null>(null);
  const [err, setErr] = useState("");
  const [grantSlug, setGrantSlug] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !term.trim()) return;
    setBusy(true);
    setErr("");
    setSearched(false);
    try {
      const r = await searchUser(kind, term);
      setFound(r);
      setSearched(true);
      if (r) {
        const first = courses.find((c) => !r.enrolled.includes(c.slug))?.slug ?? "";
        setGrantSlug(first);
      }
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "error");
    } finally {
      setBusy(false);
    }
  };

  const refresh = async (userId: string, k: SearchKind, v: string) => {
    try {
      const r = await searchUser(k, v);
      setFound(r);
    } catch {
      /* keep stale card */
    }
    void userId;
  };

  const act = async (fn: () => Promise<void>, after?: () => void) => {
    setErr("");
    try {
      await fn();
      after?.();
      await refresh(found?.id ?? "", kind, term);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "error");
    }
  };

  const courseName = (slug: string) => {
    const c = courses.find((x) => x.slug === slug);
    return c ? c.name[lang] ?? c.name.en : slug;
  };

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
        {u.title}
      </h1>

      <form onSubmit={submit} className="flex flex-wrap gap-2 rounded-[20px] border bg-white p-4" style={{ borderColor: "var(--kt-line)" }}>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as SearchKind)}
          aria-label={u.searchBy}
          className="min-h-[44px] rounded-full border bg-white px-4 text-sm font-bold"
          style={{ borderColor: "var(--kt-line)" }}
        >
          <option value="phone">{u.byPhone}</option>
          <option value="email">{u.byEmail}</option>
          <option value="national_id">{u.byNationalId}</option>
        </select>
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={u.searchPh}
          dir="ltr"
          className="min-h-[44px] min-w-0 flex-1 rounded-full border bg-white px-5 text-[15px]"
          style={{ borderColor: "var(--kt-line)" }}
        />
        <button type="submit" disabled={busy} className="btn btn-primary disabled:opacity-60" style={{ minHeight: 44 }}>
          {u.searchGo}
        </button>
      </form>

      {err !== "" && (
        <p role="alert" className="text-sm font-bold" style={{ color: "#B3261E" }}>{err}</p>
      )}
      {searched && !found && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>{u.noUser}</p>
      )}

      {found && (
        <div className="grid gap-4 rounded-[20px] border bg-white p-6" style={{ borderColor: "var(--kt-line)" }}>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>{found.name}</h2>
            {found.banned && (
              <span className="rounded-full px-3 py-1 text-xs font-bold text-white" style={{ background: "#B3261E" }}>
                {u.bannedBadge}
              </span>
            )}
            <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: "var(--surface)", color: "var(--muted)" }}>
              {found.role}
            </span>
          </div>
          <dl className="grid gap-1.5 text-sm sm:grid-cols-2">
            <div><dt className="font-bold">Email</dt><dd dir="ltr">{found.email}</dd></div>
            <div><dt className="font-bold">{u.byPhone}</dt><dd dir="ltr">{found.phone ?? "—"}</dd></div>
            <div><dt className="font-bold">{u.byNationalId}</dt><dd dir="ltr">{found.national_id ?? "—"}</dd></div>
            <div><dt className="font-bold">Tracks</dt><dd dir="ltr">{found.tracks.join(", ") || "—"}</dd></div>
          </dl>

          <div>
            <h3 className="font-bold" style={{ fontFamily: "var(--font-display)" }}>{u.enrolledL}</h3>
            {found.enrolled.length === 0 ? (
              <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>{u.noneYet}</p>
            ) : (
              <ul className="mt-2 grid gap-2">
                {found.enrolled.map((slug) => (
                  <li key={slug} className="flex items-center justify-between gap-3 rounded-xl p-3 text-sm" style={{ background: "var(--surface)" }}>
                    <span className="font-bold">{courseName(slug)}</span>
                    <button
                      type="button"
                      onClick={() => void act(() => revokeEnrollment(found.id, slug))}
                      className="text-sm font-bold"
                      style={{ color: "#B3261E" }}
                    >
                      {u.revoke}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <select
                value={grantSlug}
                onChange={(e) => setGrantSlug(e.target.value)}
                aria-label={u.grantL}
                className="min-h-[44px] rounded-full border bg-white px-4 text-sm"
                style={{ borderColor: "var(--kt-line)" }}
              >
                <option value="">{u.grantL}</option>
                {courses.filter((c) => !found.enrolled.includes(c.slug)).map((c) => (
                  <option key={c.slug} value={c.slug}>{c.name[lang] ?? c.name.en}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={!grantSlug}
                onClick={() => grantSlug && void act(() => grantEnrollment(found.id, grantSlug))}
                className="btn btn-primary disabled:opacity-60"
                style={{ minHeight: 44 }}
              >
                {u.grantBtn}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 border-t pt-4" style={{ borderColor: "var(--kt-line)" }}>
            <button
              type="button"
              onClick={() => {
                if (!window.confirm(found.banned ? u.confirmUnban : u.confirmBan)) return;
                void act(() => setBanned(found.id, !found.banned));
              }}
              className="btn btn-secondary"
              style={{ minHeight: 44 }}
            >
              {found.banned ? u.unban : u.ban}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!window.confirm(u.confirmDelUser)) return;
                void act(() => deleteProfile(found.id), () => {
                  setFound(null);
                  setSearched(false);
                  setTerm("");
                });
              }}
              className="btn btn-secondary"
              style={{ minHeight: 44, color: "#B3261E" }}
            >
              {u.delUser}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
