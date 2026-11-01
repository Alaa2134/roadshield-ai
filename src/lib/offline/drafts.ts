import * as Crypto from 'expo-crypto';
import { create } from 'zustand';
import { deleteDraftFiles } from '../images';
import type { Detection, HazardCategory, HazardSeverity } from '../types';
import { getDb } from './db';

export type DraftPhoto = {
  uri: string;
  width: number;
  height: number;
  /** Set once the photo is in Supabase Storage (path inside the hazard-images bucket). */
  uploadedPath?: string;
  privacyBlurred?: boolean;
};

export type DraftAi = {
  state: 'ok' | 'unavailable' | 'failed' | 'not_configured';
  payload?: string;
  signature?: string;
  modelName?: string;
  modelVersion?: string;
  topCategory?: HazardCategory | null;
  topConfidence?: number | null;
  detections?: Detection[];
  imageWidth?: number;
  imageHeight?: number;
  privacy?: { faces: number; plates: number; applied: boolean };
};

export type DraftData = {
  photos: DraftPhoto[];
  ai: DraftAi | null;
  category: HazardCategory | null;
  severity: HazardSeverity | null;
  description: string;
  latitude: number | null;
  longitude: number | null;
  locationSource: 'gps' | 'manual';
  accuracy: number | null;
  address: string | null;
  city: string | null;
};

export type DraftStatus = 'draft' | 'queued' | 'uploading' | 'failed' | 'submitted';

export type Draft = {
  id: string;
  userId: string;
  status: DraftStatus;
  data: DraftData;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: number;
  remoteId: string | null;
  publicCode: string | null;
  createdAt: number;
  updatedAt: number;
};

type Row = {
  id: string;
  user_id: string;
  status: DraftStatus;
  data: string;
  attempts: number;
  last_error: string | null;
  next_attempt_at: number;
  remote_id: string | null;
  public_code: string | null;
  created_at: number;
  updated_at: number;
};

const fromRow = (r: Row): Draft => ({
  id: r.id,
  userId: r.user_id,
  status: r.status,
  data: JSON.parse(r.data) as DraftData,
  attempts: r.attempts,
  lastError: r.last_error,
  nextAttemptAt: r.next_attempt_at,
  remoteId: r.remote_id,
  publicCode: r.public_code,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const emptyDraftData = (): DraftData => ({
  photos: [],
  ai: null,
  category: null,
  severity: null,
  description: '',
  latitude: null,
  longitude: null,
  locationSource: 'gps',
  accuracy: null,
  address: null,
  city: null,
});

/** Lightweight observable so lists refresh whenever the queue changes. */
export const useDraftsVersion = create<{ v: number; bump: () => void }>((set) => ({
  v: 0,
  bump: () => set((s) => ({ v: s.v + 1 })),
}));
const changed = () => useDraftsVersion.getState().bump();

export function newDraftId(): string {
  return Crypto.randomUUID();
}

export async function saveDraft(id: string, userId: string, data: DraftData, status: DraftStatus = 'draft') {
  const db = await getDb();
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO drafts (id, user_id, status, data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, status = excluded.status, updated_at = excluded.updated_at`,
    id,
    userId,
    status,
    JSON.stringify(data),
    now,
    now,
  );
  changed();
}

export async function getDraft(id: string): Promise<Draft | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Row>('SELECT * FROM drafts WHERE id = ?', id);
  return row ? fromRow(row) : null;
}

export async function listDrafts(userId: string): Promise<Draft[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>(
    `SELECT * FROM drafts WHERE user_id = ? AND status <> 'submitted' ORDER BY updated_at DESC`,
    userId,
  );
  return rows.map(fromRow);
}

export async function pendingCount(userId: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM drafts WHERE user_id = ? AND status IN ('queued','uploading','failed')`,
    userId,
  );
  return row?.n ?? 0;
}

export async function updateDraft(id: string, patch: Partial<Omit<Draft, 'id' | 'userId' | 'createdAt'>>) {
  const db = await getDb();
  const current = await getDraft(id);
  if (!current) return;
  const next = { ...current, ...patch, updatedAt: Date.now() };
  await db.runAsync(
    `UPDATE drafts SET status = ?, data = ?, attempts = ?, last_error = ?, next_attempt_at = ?,
       remote_id = ?, public_code = ?, updated_at = ? WHERE id = ?`,
    next.status,
    JSON.stringify(next.data),
    next.attempts,
    next.lastError,
    next.nextAttemptAt,
    next.remoteId,
    next.publicCode,
    next.updatedAt,
    id,
  );
  changed();
}

export async function deleteDraft(id: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM drafts WHERE id = ?', id);
  deleteDraftFiles(id);
  changed();
}

/** Drafts stuck in "uploading" after a crash/kill are returned to the queue on start-up. */
export async function recoverInterruptedUploads() {
  const db = await getDb();
  await db.runAsync(`UPDATE drafts SET status = 'queued' WHERE status = 'uploading'`);
}
