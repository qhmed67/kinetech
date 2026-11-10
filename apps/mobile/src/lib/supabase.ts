import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { ENV } from "./env";

const supabaseUrl = ENV.SUPABASE_URL;
const supabaseAnonKey = ENV.SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: SecureStore,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
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

export async function signIn(email: string, password: string): Promise<{ user: User; session: any }> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  return {
    user: data.user as User,
    session: data.session,
  };
}

export async function signUp(email: string, password: string, name: string, phone?: string): Promise<{ user: User; session: any }> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name,
        phone,
      },
    },
  });

  if (error) {
    throw error;
  }

  return {
    user: data.user as User,
    session: data.session,
  };
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
}

export async function refreshSession(): Promise<{ user: User; session: any }> {
  const { data, error } = await supabase.auth.refreshSession();
  
  if (error) {
    throw error;
  }

  return {
    user: data.user as User,
    session: data.session,
  };
}