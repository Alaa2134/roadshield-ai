import type { BBox } from '../geo';
import type { HazardSummary } from '../types';
import { getDb, getMeta, setMeta } from './db';

/** Stores the latest verified hazards so the map and warnings keep working offline. */
export async function cacheHazards(hazards: HazardSummary[]) {
  if (hazards.length === 0) return;
  const db = await getDb();
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    for (const h of hazards) {
      await db.runAsync(
        `INSERT INTO hazard_cache (id, latitude, longitude, data, cached_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET latitude = excluded.latitude, longitude = excluded.longitude,
           data = excluded.data, cached_at = excluded.cached_at`,
        h.id,
        h.latitude,
        h.longitude,
        JSON.stringify(h),
        now,
      );
    }
  });
  await setMeta('hazard_cache_at', String(now));
}

/** Server is the source of truth: hazards that left a fetched area are removed locally. */
export async function reconcileArea(box: BBox, fresh: HazardSummary[]) {
  const db = await getDb();
  const keep = new Set(fresh.map((h) => h.id));
  const rows = await db.getAllAsync<{ id: string }>(
    'SELECT id FROM hazard_cache WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?',
    box.minLat,
    box.maxLat,
    box.minLng,
    box.maxLng,
  );
  const stale = rows.filter((r) => !keep.has(r.id)).map((r) => r.id);
  for (const id of stale) await db.runAsync('DELETE FROM hazard_cache WHERE id = ?', id);
  await cacheHazards(fresh);
}

export async function cachedHazardsInBBox(box: BBox): Promise<HazardSummary[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ data: string }>(
    'SELECT data FROM hazard_cache WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ? LIMIT 2000',
    box.minLat,
    box.maxLat,
    box.minLng,
    box.maxLng,
  );
  return rows.map((r) => JSON.parse(r.data) as HazardSummary);
}

export async function cacheTimestamp(): Promise<number | null> {
  const v = await getMeta('hazard_cache_at');
  return v ? Number(v) : null;
}

export async function clearHazardCache() {
  const db = await getDb();
  await db.runAsync('DELETE FROM hazard_cache');
  await db.runAsync('DELETE FROM warning_log');
  await setMeta('hazard_cache_at', '0');
}

/** Returns true when this hazard has not been warned about within the cooldown. */
export async function shouldWarn(hazardId: string, cooldownMs: number): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ warned_at: number }>('SELECT warned_at FROM warning_log WHERE hazard_id = ?', hazardId);
  if (row && Date.now() - row.warned_at < cooldownMs) return false;
  await db.runAsync(
    'INSERT INTO warning_log (hazard_id, warned_at) VALUES (?, ?) ON CONFLICT(hazard_id) DO UPDATE SET warned_at = excluded.warned_at',
    hazardId,
    Date.now(),
  );
  return true;
}
