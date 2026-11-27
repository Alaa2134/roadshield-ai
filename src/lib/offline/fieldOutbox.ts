import * as Crypto from 'expo-crypto';
import { create } from 'zustand';
import { uploadJpeg } from '../api/storage';
import { AppError, errorCode } from '../errors';
import { fileExists } from '../images';
import { supabase } from '../supabase';
import { getDb } from './db';
import { backoff, RETRYABLE } from './sync';

/**
 * Offline outbox for field engineers, inspectors and contractors.
 * Every item gets a UUID when it is created on the phone; that UUID is sent as the RPC's
 * `p_client_id`, so replaying an item after a lost response never creates a duplicate
 * (submit_inspection / add_work_log / submit_cost_item return the original record).
 * Evidence photos are uploaded to org-documents/<org>/<uid>/<item>-<n>.jpg first (upsert).
 */
export type OutboxKind = 'inspection' | 'work_log' | 'cost_item';
export type OutboxItem = { id: string; kind: OutboxKind; label: string; payload: Record<string, unknown>; status: 'queued' | 'failed' | 'sent';
  attempts: number; last_error: string | null; next_attempt_at: number; created_at: number };

export const useOutbox = create<{ pending: number; syncing: boolean; set: (s: Partial<{ pending: number; syncing: boolean }>) => void }>((set) => ({
  pending: 0, syncing: false, set: (s) => set(s),
}));

const ORG_BUCKET = 'org-documents';

async function currentUser() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new AppError('NOT_AUTHENTICATED');
  return data.user.id;
}

export async function enqueue(kind: OutboxKind, label: string, payload: Record<string, unknown>): Promise<string> {
  const uid = await currentUser();
  const id = Crypto.randomUUID();
  const db = await getDb();
  await db.runAsync('INSERT INTO field_outbox (id, user_id, kind, label, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    id, uid, kind, label, JSON.stringify(payload), Date.now());
  await refreshCount();
  void flushOutbox();
  return id;
}

export async function listOutbox(): Promise<OutboxItem[]> {
  const uid = await currentUser().catch(() => null);
  if (!uid) return [];
  const db = await getDb();
  const rows = await db.getAllAsync<Omit<OutboxItem, 'payload'> & { payload: string }>(
    "SELECT * FROM field_outbox WHERE user_id = ? AND status != 'sent' ORDER BY created_at DESC", uid);
  return rows.map((r) => ({ ...r, payload: JSON.parse(r.payload) as Record<string, unknown> }));
}

export async function refreshCount() {
  useOutbox.getState().set({ pending: (await listOutbox()).length });
}

async function uploadPhotos(item: OutboxItem, uid: string): Promise<string[]> {
  const photos = (item.payload.photos as string[] | undefined) ?? [];
  const org = String(item.payload.org_id);
  const paths: string[] = [];
  for (let i = 0; i < photos.length; i++) {
    const uri = photos[i]!;
    if (!fileExists(uri)) continue;
    paths.push(await uploadJpeg(ORG_BUCKET, `${org}/${uid}/${item.id}-${i}.jpg`, uri));
  }
  return paths;
}

async function send(item: OutboxItem, uid: string) {
  const p = item.payload;
  if (item.kind === 'inspection') {
    const { error } = await supabase.rpc('submit_inspection', {
      p_road: p.road_id, p_condition: p.condition, p_notes: p.notes ?? '', p_inspected_at: p.inspected_at,
      p_latitude: p.latitude ?? null, p_longitude: p.longitude ?? null, p_defects: p.defects ?? [], p_client_id: item.id,
    });
    if (error) throw error;
  } else if (item.kind === 'work_log') {
    const paths = await uploadPhotos(item, uid);
    const { error } = await supabase.rpc('add_work_log', {
      p_work_order: p.work_order_id, p_log_date: p.log_date, p_note: p.note, p_progress_pct: p.progress_pct ?? null, p_photo_paths: paths, p_client_id: item.id,
    });
    if (error) throw error;
  } else {
    const { error } = await supabase.rpc('submit_cost_item', {
      p_project: p.project_id, p_work_order: p.work_order_id ?? null, p_category: p.category, p_description: p.description, p_unit: p.unit,
      p_quantity: p.quantity, p_unit_rate: p.unit_rate, p_cost_date: p.cost_date, p_source_kind: p.source_kind, p_client_id: item.id,
    });
    if (error) throw error;
  }
}

let running = false;
/** Sends due items; network failures back off (30 s → 30 min), validation errors stop for review. */
export async function flushOutbox(force = false): Promise<number> {
  if (running) return 0;
  running = true;
  useOutbox.getState().set({ syncing: true });
  let sent = 0;
  try {
    const uid = await currentUser();
    const db = await getDb();
    for (const item of await listOutbox()) {
      if (!force && (item.status === 'failed' || item.next_attempt_at > Date.now())) continue;
      try {
        await send(item, uid);
        await db.runAsync("UPDATE field_outbox SET status = 'sent', last_error = NULL WHERE id = ?", item.id);
        sent += 1;
      } catch (e) {
        const code = errorCode(e);
        const msg = (e as { message?: string })?.message ?? code;
        const retry = RETRYABLE.has(code);
        await db.runAsync('UPDATE field_outbox SET attempts = attempts + 1, last_error = ?, status = ?, next_attempt_at = ? WHERE id = ?',
          /^[A-Z_]+$/.test(msg) ? msg : code, retry ? 'queued' : 'failed', Date.now() + backoff(item.attempts + 1), item.id);
        if (code === 'network') break;
      }
    }
  } catch {
    // not signed in: nothing to send
  } finally {
    running = false;
    useOutbox.getState().set({ syncing: false });
    await refreshCount().catch(() => undefined);
  }
  return sent;
}

export async function discard(id: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM field_outbox WHERE id = ?', id);
  await refreshCount();
}
