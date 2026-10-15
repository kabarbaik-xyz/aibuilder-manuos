export interface CacheEntry<T> {
  data: T;
  expiry: number;
}

const memoryStore = new Map<string, CacheEntry<any>>();

export function getCached<T>(key: string): T | null {
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (entry.expiry <= Date.now()) {
    memoryStore.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCached<T>(key: string, data: T, ttlMs: number = 5 * 60 * 1000): void {
  memoryStore.set(key, {
    data,
    expiry: Date.now() + ttlMs,
  });
}

export function clearCache(): void {
  memoryStore.clear();
}
