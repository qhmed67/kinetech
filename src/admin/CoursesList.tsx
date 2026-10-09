import { deleteCourse, getCourse, getVideos, loadStore, useContent } from "../store";
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
      {courses.map((raw) => {
        // Localized view with cross-language fallback (raw store text blanks
        // one-language courses in the admin list).
        const view = getCourse(lang, raw.slug);
        const name = view?.name ?? raw.name[lang] ?? raw.name.en;
        const cat = view?.cat ?? raw.cat;
        const videoCount = getVideos(raw.slug).length;
        return (
        <article
          key={raw.slug}
          className="flex flex-col gap-4 rounded-[20px] border bg-white p-5 sm:flex-row sm:items-center"
          style={{ borderColor: "var(--kt-line)" }}
        >
          <SafeImg
            src={raw.photoCard}
            alt=""
            className="h-20 w-full rounded-2xl object-cover object-top sm:w-32"
          />
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-bold" style={{ fontFamily: "var(--font-display)" }}>
              {name}
            </h2>
            <p className="mt-0.5 text-sm" dir="ltr" style={{ color: "var(--muted)" }}>
              {raw.slug} · {cat}{raw.bac ? " · bac" : ""} · {videoCount} {a.videosL}
            </p>
          </div>
          <div className="flex flex-none flex-wrap gap-2">
            <a
              href={`#/admin/courses/${raw.slug}`}
              className="btn btn-secondary"
              style={{ minHeight: 40, padding: "8px 18px", fontSize: 14 }}
            >
              {a.edit}
            </a>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(a.confirmDel)) deleteCourse(raw.slug);
              }}
              className="btn btn-secondary"
              style={{ minHeight: 40, padding: "8px 18px", fontSize: 14, color: "#B3261E" }}
            >
              {a.del}
            </button>
          </div>
        </article>
        );
      })}
    </div>
  );
}
