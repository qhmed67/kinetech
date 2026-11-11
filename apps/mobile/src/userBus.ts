/* Shared user identity bus (types + listeners). Kept dependency-free so
 * authDb and lib/sync can both import it without cycles. */

export type KtUser = {
  name: string;
  email: string;
  phone: string;
  enrolled: string[];
  tracks: string[];
  role: "student" | "admin";
  banned: boolean;
};

export type TrackId = "courses" | "marketing" | "programming" | "design";

export const DEFAULT_TRACKS: string[] = ["courses"];

type UserListener = () => void;
const userListeners = new Set<UserListener>();

export function subscribeUserChanged(fn: UserListener): () => void {
  userListeners.add(fn);
  return () => {
    userListeners.delete(fn);
  };
}

export function notifyUserChanged(): void {
  userListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}
