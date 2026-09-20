export type KtUser = {
  name: string;
  email: string;
};

const KEY = "kt-user";

export function getUser(): KtUser | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const u = JSON.parse(raw) as Partial<KtUser>;
    if (typeof u.name === "string" && u.name) return { name: u.name, email: u.email ?? "" };
    return null;
  } catch {
    return null;
  }
}

export function setUser(u: KtUser) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(u));
  } catch {
    /* ignore */
  }
}

export function clearUser() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function initialsOf(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "KT";
}
