/**
 * Tests for dashboard cache eviction logic.
 * Verifies TTL expiration, max size limits, and cleanup behavior.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

// ── Replicate cache logic from dashboard.ts ─────────────

interface CacheEntry<T> {
  data: T;
  ts: number;
}

class BoundedCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private ttl: number;
  private maxSize: number;

  constructor(ttl: number, maxSize: number) {
    this.ttl = ttl;
    this.maxSize = maxSize;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.ts < this.ttl) return entry.data;
    this.cache.delete(key);
    return null;
  }

  set(key: string, data: T): void {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, { data, ts: Date.now() });
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.ts > this.ttl) this.cache.delete(key);
    }
  }

  get size(): number {
    return this.cache.size;
  }
}

// ── Tests ────────────────────────────────────────────────

describe("BoundedCache", () => {
  let cache: BoundedCache<string>;

  beforeEach(() => {
    cache = new BoundedCache<string>(1000, 5); // 1s TTL, max 5 entries
  });

  it("should store and retrieve values", () => {
    cache.set("key1", "value1");
    assert.equal(cache.get("key1"), "value1");
  });

  it("should return null for missing keys", () => {
    assert.equal(cache.get("nonexistent"), null);
  });

  it("should evict oldest entry when max size reached", () => {
    cache.set("a", "1");
    cache.set("b", "2");
    cache.set("c", "3");
    cache.set("d", "4");
    cache.set("e", "5");
    assert.equal(cache.size, 5);

    // Adding 6th should evict "a" (oldest)
    cache.set("f", "6");
    assert.equal(cache.size, 5);
    assert.equal(cache.get("a"), null); // evicted
    assert.equal(cache.get("f"), "6"); // newest
  });

  it("should expire entries after TTL", async () => {
    const shortCache = new BoundedCache<string>(50, 100); // 50ms TTL
    shortCache.set("key1", "value1");
    assert.equal(shortCache.get("key1"), "value1");

    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(shortCache.get("key1"), null);
  });

  it("should cleanup expired entries", async () => {
    const shortCache = new BoundedCache<string>(50, 100);
    shortCache.set("a", "1");
    shortCache.set("b", "2");
    shortCache.set("c", "3");
    assert.equal(shortCache.size, 3);

    await new Promise((resolve) => setTimeout(resolve, 60));
    shortCache.cleanup();
    assert.equal(shortCache.size, 0);
  });

  it("should not evict fresh entries during cleanup", async () => {
    const shortCache = new BoundedCache<string>(100, 100);
    shortCache.set("old", "1");

    await new Promise((resolve) => setTimeout(resolve, 60));

    shortCache.set("fresh", "2"); // added after delay

    await new Promise((resolve) => setTimeout(resolve, 50));

    shortCache.cleanup();
    // "old" should be expired (110ms old), "fresh" should survive (50ms old)
    assert.equal(shortCache.get("old"), null);
    assert.equal(shortCache.get("fresh"), "2");
  });
});
