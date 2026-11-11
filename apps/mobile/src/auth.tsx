import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  getUser,
  signOutEverywhere,
  subscribeUserChanged,
  type KtUser,
} from "./authDb";

interface AuthContextValue {
  user: KtUser | null;
  ready: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<KtUser | null>(null);
  const [ready, setReady] = useState(false);

  const load = async () => {
    const u = await getUser();
    setUser(u);
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      await load();
      if (mounted) setReady(true);
    })();
    const unsub = subscribeUserChanged(() => {
      void load();
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  const refresh = async () => {
    await load();
  };

  const signOut = async () => {
    await signOutEverywhere();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, ready, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
