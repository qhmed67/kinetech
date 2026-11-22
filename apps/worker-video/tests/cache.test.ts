import { describe, expect, it } from "vitest";
import {
  chunkCacheKey,
  clearInflight,
  planFetch,
  probeCache,
  readChunk,
  type CacheLike,
} from "../src/cache";

/** Minimal in-memory Cache API stand-in. */
function memoryCache(): CacheLike & { store: Map<string, Response> } {
  const store = new Map<string, Response>();
  return {
    store,
    async match(key) {
      const hit = store.get(key);
      return hit ? hit.clone() : undefined;
    },
    async put(key, response) {
      store.set(key, response.clone());
    },
  };
}

/** Cache that never persists (the workers.dev behaviour). */
const deadCache: CacheLike = {
  async match() {
    return undefined;
  },
  async put() {
    /* silently drops */
  },
};

describe("chunk cache key", () => {
  it("is keyed by file id + chunk index, never a token", () => {
    const key = chunkCacheKey("file123", 7);
    expect(key).toContain("file123");
    expect(key).toContain("/7");
    expect(key).not.toContain("token");
  });
});

describe("probeCache", () => {
  it("reports true when the platform persists", async () => {
    expect(await probeCache(memoryCache())).toBe(true);
  });

  it("reports false when puts never stick (workers.dev)", async () => {
    expect(await probeCache(deadCache)).toBe(false);
  });
});

describe("planFetch (fail-safe)", () => {
  it("uses one exact range when the cache is unavailable", () => {
    expect(planFetch(false, 100, 200, 10_000, 4096)).toEqual({
      mode: "exact",
      start: 100,
      end: 200,
    });
  });

  it("uses aligned chunks when the cache is available", () => {
    const plan = planFetch(true, 0, 5000, 10_000, 4096);
    expect(plan.mode).toBe("chunks");
    if (plan.mode === "chunks") expect(plan.chunks.map((c) => c.index)).toEqual([0, 1]);
  });
});

describe("readChunk", () => {
  it("serves from cache on the second read", async () => {
    clearInflight();
    const cache = memoryCache();
    const pending: Promise<unknown>[] = [];
    let loads = 0;
    const loader = async () => {
      loads += 1;
      return new Uint8Array([1, 2, 3]).buffer;
    };
    const first = await readChunk({
      cache,
      key: chunkCacheKey("f", 0),
      loader,
      waitUntil: (p) => pending.push(p),
    });
    await Promise.all(pending);
    const second = await readChunk({
      cache,
      key: chunkCacheKey("f", 0),
      loader,
      waitUntil: (p) => pending.push(p),
    });
    expect(first.hit).toBe(false);
    expect(second.hit).toBe(true);
    expect(loads).toBe(1);
  });

  it("dedupes concurrent loads for the same key", async () => {
    clearInflight();
    const cache = memoryCache();
    let loads = 0;
    const loader = async () => {
      loads += 1;
      return new Uint8Array([9]).buffer;
    };
    const opts = {
      cache,
      key: chunkCacheKey("f", 1),
      loader,
      waitUntil: () => undefined,
    };
    await Promise.all([readChunk(opts), readChunk(opts)]);
    expect(loads).toBe(1);
  });
});
