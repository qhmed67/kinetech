import {
  createSupabaseClient,
  type StorageAdapter,
} from "@kinetech/core";

function makeAdapter(): StorageAdapter {
  const store = new Map<string, string>();
  return {
    getItem: async (k) => store.get(k) ?? null,
    setItem: async (k, v) => {
      store.set(k, v);
    },
    removeItem: async (k) => {
      store.delete(k);
    },
  };
}

describe("createSupabaseClient factory", () => {
  it("creates a client with mobile auth flags", () => {
    const client = createSupabaseClient({
      url: "https://test.supabase.co",
      key: "anon-key",
      storage: makeAdapter(),
      detectSessionInUrl: false,
      autoRefreshToken: true,
    });

    if (!client) throw new Error("client is null");
    expect(typeof client.auth.getSession).toBe("function");
  });
});

describe("mobile key-role contract", () => {
  function roleOf(key: string): string | null {
    try {
      const p = key.split(".")[1];
      if (!p) return null;
      const b = p.replace(/-/g, "+").replace(/_/g, "/");
      const txt = atob(b + "=".repeat((4 - (b.length % 4)) % 4));
      return (JSON.parse(txt) as { role?: string }).role ?? null;
    } catch {
      return null;
    }
  }

  it("accepts anon/publishable keys", () => {
    const anon = [
      "hdr",
      Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url"),
      "sig",
    ].join(".");
    expect(roleOf(anon)).toBe("anon");
  });

  it("detects service-role keys so the mobile bundle can block them", () => {
    const service = [
      "hdr",
      Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url"),
      "sig",
    ].join(".");
    expect(roleOf(service)).toBe("service_role");
  });

  it("returns null for non-JWT keys without throwing", () => {
    expect(roleOf("plain-key")).toBeNull();
  });
});
