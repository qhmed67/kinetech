import { courseExists } from "./store";

export const COURSE_SLUGS = ["python-data", "robotics", "solidworks"] as const;

export type Route =
  | { name: "home" }
  | { name: "courses" }
  | { name: "course"; slug: string }
  | { name: "watch"; slug: string; video: number }
  | { name: "baccalaureate" }
  | { name: "dashboard"; tab?: string }
  | { name: "service"; slug: "marketing" | "software" | "design" }
  | { name: "about" }
  | { name: "contact" }
  | { name: "privacy" }
  | { name: "terms" }
  | { name: "adminLogin" }
  | { name: "admin"; page: string }
  | { name: "notfound" };

export function courseIndex(slug: string): number {
  return COURSE_SLUGS.indexOf(slug as (typeof COURSE_SLUGS)[number]);
}

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#\/?/, "");
  if (!h) return { name: "home" };
  if (h === "courses") return { name: "courses" };
  const wm = h.match(/^courses\/([a-z0-9-]+)\/watch(?:\/(\d+))?$/);
  if (wm) {
    if (!courseExists(wm[1])) return { name: "notfound" };
    return {
      name: "watch",
      slug: wm[1],
      video: Math.max(0, parseInt(wm[2] ?? "0", 10) || 0),
    };
  }
  const cm = h.match(/^courses?\/([a-z0-9-]+)$/);
  if (cm) {
    if (!courseExists(cm[1])) return { name: "notfound" };
    return { name: "course", slug: cm[1] };
  }
  if (h === "baccalaureate") return { name: "baccalaureate" };
  const dm = h.match(/^dashboard(?:\/([a-z]+))?$/);
  if (dm) return { name: "dashboard", tab: dm[1] };
  const sm = h.match(/^services\/(marketing|software|design)$/);
  if (sm)
    return {
      name: "service",
      slug: sm[1] as "marketing" | "software" | "design",
    };
  if (h === "about") return { name: "about" };
  if (h === "contact") return { name: "contact" };
  if (h === "privacy") return { name: "privacy" };
  if (h === "terms") return { name: "terms" };
  if (h === "admin/login") return { name: "adminLogin" };
  const am = h.match(/^admin(?:\/([\w/-]+))?$/);
  if (am) return { name: "admin", page: am[1] ?? "dashboard" };
  return { name: "notfound" };
}

export function go(to: string) {
  window.location.hash = `#/${to}`;
}
