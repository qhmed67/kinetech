import { adminLogout, isAdmin } from "../store";
import { useLang } from "../components/lang";

export function AdminShell({
  active,
  children,
}: {
  active: string;
  children: React.ReactNode;
}) {
  const { t, toggle } = useLang();
  const a = t.admin;

  if (!isAdmin()) {
    window.location.hash = "#/admin/login";
    return null;
  }

  const nav = (page: string, label: string) => (
    <a
      key={page}
      href={`#/admin/${page}`}
      aria-current={active === page ? "page" : undefined}
      className="block rounded-xl px-4 py-3 text-sm font-bold"
      style={
        active === page
          ? { background: "var(--kt-deep)", color: "#fff" }
          : { color: "var(--muted)" }
      }
    >
      {label}
    </a>
  );

  return (
    <div style={{ background: "var(--surface)", minHeight: "100dvh" }}>
      <header style={{ background: "var(--kt-deep)" }}>
        <div className="kt-wrap flex items-center gap-4 py-3" dir="ltr">
          <span
            className="rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.12em]"
            style={{ background: "var(--kt-teal)", color: "var(--kt-deep)", fontFamily: "var(--font-display)" }}
          >
            {a.dashT}
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={toggle}
            aria-label="Switch language"
            className="rounded-full border border-white/30 px-4 py-1.5 text-sm font-bold text-white"
          >
            {t.toggle}
          </button>
          <a href="#/" className="text-sm font-bold text-white/80">
            {a.viewSite}
          </a>
          <button
            type="button"
            onClick={() => {
              adminLogout();
              window.location.hash = "#/admin/login";
            }}
            className="text-sm font-bold"
            style={{ color: "#FF9D97" }}
          >
            {a.logout}
          </button>
        </div>
      </header>
      <div className="kt-wrap grid gap-6 py-8 lg:grid-cols-[220px_1fr]">
        <nav
          className="grid h-fit content-start gap-1 rounded-[20px] border bg-white p-3 lg:sticky lg:top-6"
          style={{ borderColor: "var(--kt-line)" }}
          aria-label="admin"
        >
          {nav("dashboard", a.dashT)}
          {nav("courses", a.coursesT)}
          {nav("services", a.servicesT)}
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
