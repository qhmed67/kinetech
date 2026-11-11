import { AppState } from "react-native";
import * as SecureStore from "expo-secure-store";
import { createSupabaseClient, type StorageAdapter } from "@kinetech/core";

const storage: StorageAdapter = {
  getItem: (k) => SecureStore.getItemAsync(k),
  setItem: (k, v) => SecureStore.setItemAsync(k, v),
  removeItem: (k) => SecureStore.deleteItemAsync(k),
};

function decodeJwtRole(key: string): string | null {
  try {
    const p = key.split(".")[1];
    if (!p) return null;
    const b = p.replace(/-/g, "+").replace(/_/g, "/");
    const txt = atob(b + "=".repeat((4 - (b.length % 4)) % 4));
    return (JSON.parse(txt) as { role?: string }).role ?? null;
  } catch { return null; }
}

export function getSupabase() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !key) return null;
  const role = decodeJwtRole(key);
  // Assert: service-role must never reach the mobile bundle (anon/publishable only).
  if (role && role !== "anon") throw new Error("Supabase key role must be anon; service-role key blocked in mobile bundle.");
  return createSupabaseClient({ url, key, storage, detectSessionInUrl: false, autoRefreshToken: true });
}

AppState.addEventListener("change", (state) => {
  // Token auto-refresh is handled by Supabase with autoRefreshToken:true.
  // This keeps the listener explicit for later gating if needed.
  void state;
});

export interface User {
  id: string;
  email: string;
  name?: string;
  phone?: string;
  role: "student" | "admin";
  enrolled: string[];
  tracks: string[];
  banned: boolean;
}

export interface AuthState {
  user: User | null;
  loading: boolean;
}

function dbUser(raw: any): User {
  const meta = raw?.user_metadata ?? {};
  return {
    id: raw?.id,
    email: raw?.email ?? "",
    name: meta.name,
    phone: meta.phone,
    role: (meta.role as "student" | "admin") ?? "student",
    enrolled: (meta.enrolled as string[]) ?? [],
    tracks: (meta.tracks as string[]) ?? [],
    banned: Boolean(meta.banned),
  };
}

export async function signIn(email: string, password: string): Promise<{ user: User; session: any }> {
  const client = getSupabase();
  if (!client) throw new Error("Supabase client not configured");
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { user: dbUser(data.user), session: data.session };
}

export async function signUp(email: string, password: string, name: string, phone?: string): Promise<{ user: User; session: any }> {
  const client = getSupabase();
  if (!client) throw new Error("Supabase client not configured");
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: { name, phone } },
  });
  if (error) throw error;
  return { user: dbUser(data.user), session: data.session };
}

export async function signOut(): Promise<void> {
  const client = getSupabase();
  if (!client) throw new Error("Supabase client not configured");
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function refreshSession(): Promise<{ user: User; session: any }> {
  const client = getSupabase();
  if (!client) throw new Error("Supabase client not configured");
  const { data, error } = await client.auth.refreshSession();
  if (error) throw error;
  return { user: dbUser(data.user), session: data.session };
}
