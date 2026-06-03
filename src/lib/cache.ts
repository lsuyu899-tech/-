/**
 * Server-side in-memory cache for TikHub API responses.
 * Prevents redundant API calls for the same keyword/noteId within TTL.
 *
 * Key strategy:
 * - Search: cache by keyword + sort_type + time_filter
 * - Comments: cache by noteId
 * - TTL: 2 hours (configurable)
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const DEFAULT_TTL = 2 * 60 * 60 * 1000; // 2 hours in ms
const MAX_CACHE_SIZE = 200; // Max entries to prevent memory bloat

const cache = new Map<string, CacheEntry<unknown>>();

function isExpired(entry: CacheEntry<unknown>): boolean {
  return Date.now() - entry.timestamp > DEFAULT_TTL;
}

function evictIfNeeded(): void {
  if (cache.size <= MAX_CACHE_SIZE) return;
  // Remove oldest entries first
  const entries = [...cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
  const toRemove = entries.slice(0, cache.size - MAX_CACHE_SIZE);
  toRemove.forEach(([key]) => cache.delete(key));
}

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (isExpired(entry)) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCache<T>(key: string, data: T): void {
  evictIfNeeded();
  cache.set(key, { data, timestamp: Date.now() });
}

/** Build cache key for search results */
export function searchCacheKey(keyword: string, sortType: string, timeFilter: string): string {
  return `search:${keyword}:${sortType}:${timeFilter}`;
}

/** Build cache key for note comments */
export function commentsCacheKey(noteId: string): string {
  return `comments:${noteId}`;
}

/** Get cache stats for debugging */
export function getCacheStats(): { size: number; keys: string[] } {
  return { size: cache.size, keys: [...cache.keys()] };
}
