import { loadStore, useContent } from "../store";
import { useLang } from "../components/lang";
import { AdminShell } from "./AdminShell";
import { CoursesList } from "./CoursesList";
import { CourseForm } from "./CourseForm";
import { ServicesEditor } from "./ServicesEditor";

function Home() {
  const { t } = useLang();
  const a = t.admin;
  useContent();
  const s = loadStore();
  const videos = s.courses.reduce((n, c) => n + c.videos.length, 0);
  let kb = 0;
  try {
    kb = Math.round((JSON.stringify(window.localStorage).length * 2) / 1024);
  } catch {
    kb = 0;
  }
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
        {a.dashT}
      </h1>
      <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
        {[
          { label: a.coursesT, value: s.courses.length, to: "#/admin/courses" },
          { label: a.videosL, value: videos, to: "#/admin/courses" },
          { label: a.servicesT, value: 3, to: "#/admin/services" },
          { label: "Storage KB", value: kb, to: "#/admin/dashboard" },
        ].map((x) => (
          <a
            key={x.label}
            href={x.to}
            className="rounded-[20px] border bg-white p-3 sm:p-5"
            style={{ borderColor: "var(--kt-line)" }}
          >
            <p className="text-xs sm:text-sm" style={{ color: "var(--muted)" }}>{x.label}</p>
            <p className="mt-1 text-xl font-bold sm:text-3xl" dir="ltr" style={{ fontFamily: "var(--font-display)", fontVariantNumeric: "tabular-nums" }}>
              {x.value}
            </p>
          </a>
        ))}
      </div>
      <a href="#/admin/courses/new" className="btn btn-primary self-start">
        + {a.addCourse}
      </a>
    </div>
  );
}

export function AdminApp({ page }: { page: string }) {
  if (page === "courses") {
    return (
      <AdminShell active="courses">
        <CoursesList />
      </AdminShell>
    );
  }
  if (page === "courses/new") {
    return (
      <AdminShell active="courses">
        <CourseForm />
      </AdminShell>
    );
  }
  const cm = page.match(/^courses\/(.+)$/);
  if (cm) {
    return (
      <AdminShell active="courses">
        <CourseForm slug={decodeURIComponent(cm[1])} />
      </AdminShell>
    );
  }
  if (page === "services") {
    return (
      <AdminShell active="services">
        <ServicesEditor />
      </AdminShell>
    );
  }
  return (
    <AdminShell active="dashboard">
      <Home />
    </AdminShell>
  );
}
