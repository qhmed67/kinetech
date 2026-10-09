import { deleteCourse, loadStore, useContent } from "../store";
import { SafeImg } from "../components/SafeImg";
import { useLang } from "../components/lang";

export function CoursesList() {
  const { lang, t } = useLang();
  const a = t.admin;
  useContent();
  const courses = loadStore().courses;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
          {a.coursesT} ({courses.length})
        </h1>
        <a href="#/admin/courses/new" className="btn btn-primary">
          + {a.addCourse}
        </a>
      </div>
      {courses.map((c) => (
        <article
          key={c.slug}
          className="flex flex-col gap-4 rounded-[20px] border bg-white p-5 sm:flex-row sm:items-center"
          style={{ borderColor: "var(--kt-line)" }}
        >
          <SafeImg
            src={c.photoCard}
            alt=""
            className="h-20 w-full rounded-2xl object-cover object-top sm:w-32"
          />
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-bold" style={{ fontFamily: "var(--font-display)" }}>
              {c.name[lang]}
            </h2>
            <p className="mt-0.5 text-sm" dir="ltr" style={{ color: "var(--muted)" }}>
              {c.slug} · {c.cat}{c.bac ? " · bac" : ""} · {c.videos.length} {a.videosL}
            </p>
          </div>
          <div className="flex flex-none flex-wrap gap-2">
            <a
              href={`#/admin/courses/${c.slug}`}
              className="btn btn-secondary"
              style={{ minHeight: 40, padding: "8px 18px", fontSize: 14 }}
            >
              {a.edit}
            </a>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(a.confirmDel)) deleteCourse(c.slug);
              }}
              className="btn btn-secondary"
              style={{ minHeight: 40, padding: "8px 18px", fontSize: 14, color: "#B3261E" }}
            >
              {a.del}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
