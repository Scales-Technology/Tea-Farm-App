// src/hooks/useOfflineCache.ts
import AsyncStorage from "@react-native-async-storage/async-storage";

const CACHE_TTL_MS  = 1000 * 60 * 60; // 1 hour — cached reads expire after this
const PENDING_KEY   = "teafarm_pending_writes";

// ── Cache reads (so screens load instantly offline) ───────────────────────────
export async function saveCache(key: string, data: any): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify({ data, savedAt: Date.now() }));
  } catch {}
}

export async function loadCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const { data, savedAt } = JSON.parse(raw);
    if (Date.now() - savedAt > CACHE_TTL_MS) return null; // stale
    return data as T;
  } catch { return null; }
}

export async function clearCache(key: string): Promise<void> {
  try { await AsyncStorage.removeItem(key); } catch {}
}

// ── Pending write queue (offline writes stored here until sync) ───────────────
export interface PendingWrite {
  id:             string;   // unique per write — used to deduplicate
  collectionName: string;
  data:           Record<string, any>;
  queuedAt:       number;
}

export async function enqueuePendingWrite(write: Omit<PendingWrite, "id" | "queuedAt">): Promise<void> {
  try {
    const raw     = await AsyncStorage.getItem(PENDING_KEY);
    const pending: PendingWrite[] = raw ? JSON.parse(raw) : [];
    pending.push({
      ...write,
      id:       `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      queuedAt: Date.now(),
    });
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {}
}

export async function getPendingWrites(): Promise<PendingWrite[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function clearPendingWrites(): Promise<void> {
  try { await AsyncStorage.removeItem(PENDING_KEY); } catch {}
}