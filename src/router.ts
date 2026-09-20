export const COURSE_SLUGS = ["python-data", "robotics", "solidworks"] as const;

export type Route =
  | { name: "home" }
  | { name: "courses" }
  | { name: "course"; slug: (typeof COURSE_SLUGS)[number] }
  | { name: "baccalaureate" }
  | { name: "dashboard"; tab?: string }
  | { name: "service"; slug: "marketing" | "software" | "design" }
  | { name: "about" }
  | { name: "contact" }
  | { name: "privacy" }
  | { name: "terms" }
  | { name: "notfound" };

export function courseIndex(slug: string): number {
  return COURSE_SLUGS.indexOf(slug as (typeof COURSE_SLUGS)[number]);
}

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#\/?/, "");
  if (!h) return { name: "home" };
  if (h === "courses") return { name: "courses" };
  const cm = h.match(/^courses?\/([a-z-]+)$/);
  if (cm) {
    const id = courseIndex(cm[1]);
    if (id >= 0) return { name: "course", slug: COURSE_SLUGS[id] };
    return { name: "notfound" };
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
  return { name: "notfound" };
}

export function go(to: string) {
  window.location.hash = `#/${to}`;
}
