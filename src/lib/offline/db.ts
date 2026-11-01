import * as SQLite from 'expo-sqlite';

/**
 * Local SQLite database for offline support:
 *  - drafts:          report drafts and the pending upload queue (photos stay on disk)
 *  - hazard_cache:    last downloaded verified hazards, for the map/home while offline
 *  - meta:            small key/value facts (e.g. when the cache was refreshed)
 *  - warning_log:     de-duplicates hazard warnings so users are not spammed
 */
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS drafts (
     id TEXT PRIMARY KEY NOT NULL,
     user_id TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'draft',
     data TEXT NOT NULL,
     attempts INTEGER NOT NULL DEFAULT 0,
     last_error TEXT,
     next_attempt_at INTEGER NOT NULL DEFAULT 0,
     remote_id TEXT,
     public_code TEXT,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE INDEX IF NOT EXISTS drafts_user_status ON drafts (user_id, status);
   CREATE TABLE IF NOT EXISTS hazard_cache (
     id TEXT PRIMARY KEY NOT NULL,
     latitude REAL NOT NULL,
     longitude REAL NOT NULL,
     data TEXT NOT NULL,
     cached_at INTEGER NOT NULL
   );
   CREATE INDEX IF NOT EXISTS hazard_cache_lat_lng ON hazard_cache (latitude, longitude);
   CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS warning_log (hazard_id TEXT PRIMARY KEY NOT NULL, warned_at INTEGER NOT NULL);`,
];

async function migrate(db: SQLite.SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version]!;
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
    });
    version += 1;
    await db.execAsync(`PRAGMA user_version = ${version}`);
  }
}

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('roadshield.db').then(async (db) => {
      await migrate(db);
      return db;
    });
  }
  return dbPromise;
}

export async function getMeta(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string) {
  const db = await getDb();
  await db.runAsync('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
}
