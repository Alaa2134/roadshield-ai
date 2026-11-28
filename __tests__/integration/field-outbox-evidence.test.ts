/**
 * Field outbox evidence integrity: a work log with N referenced photos is only marked `sent`
 * when all N were uploaded; missing files fail loudly (never silently skipped); upload failures
 * back off and retry with the same client id and the same storage paths.
 * Supabase, storage, expo-crypto and the on-device DB are replaced with fakes.
 */
type Row = { id: string; user_id: string; kind: string; label: string; payload: string; status: string; attempts: number; last_error: string | null; next_attempt_at: number; created_at: number };

const MOCK_UID = '11111111-1111-4111-8111-111111111111';
const mockRows = new Map<string, Row>();
const mockFiles = new Set<string>();
let mockNextId = 0;

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => `item-${++mockNextId}`) }));
jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: jest.fn(async () => ({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } } })) }, rpc: jest.fn() },
}));
jest.mock('@/lib/api/storage', () => ({ uploadJpeg: jest.fn() }));
jest.mock('@/lib/images', () => ({ fileExists: jest.fn((uri: string) => mockFiles.has(uri)) }));
jest.mock('@/lib/offline/db', () => ({
  getDb: jest.fn(async () => ({
    runAsync: async (sql: string, ...a: unknown[]) => {
      if (sql.startsWith('INSERT INTO field_outbox')) {
        const [id, user_id, kind, label, payload, created_at] = a as [string, string, string, string, string, number];
        mockRows.set(id, { id, user_id, kind, label, payload, status: 'queued', attempts: 0, last_error: null, next_attempt_at: 0, created_at });
      } else if (sql.includes("SET status = 'sent'")) {
        mockRows.get(a[0] as string)!.status = 'sent';
      } else if (sql.includes('attempts = attempts + 1')) {
        const [last_error, status, next, id] = a as [string, string, number, string];
        const r = mockRows.get(id)!;
        Object.assign(r, { attempts: r.attempts + 1, last_error, status, next_attempt_at: next });
      } else if (sql.includes('SET payload = ?')) {
        const [payload, id] = a as [string, string];
        Object.assign(mockRows.get(id)!, { payload, status: 'queued', last_error: null, attempts: 0, next_attempt_at: 0 });
      } else if (sql.startsWith('DELETE')) {
        mockRows.delete(a[0] as string);
      }
    },
    getAllAsync: async () => [...mockRows.values()].filter((r) => r.status !== 'sent'),
    getFirstAsync: async (_sql: string, id: string) => {
      const r = mockRows.get(id);
      return r && r.status !== 'sent' ? { payload: r.payload, kind: r.kind } : null;
    },
  })),
}));

import { uploadJpeg } from '@/lib/api/storage';
import { supabase } from '@/lib/supabase';
import { enqueue, flushOutbox, removeMissingPhotos, useOutbox } from '@/lib/offline/fieldOutbox';

const upload = uploadJpeg as jest.Mock;
const rpc = supabase.rpc as jest.Mock;
const A = 'file:///a.jpg';
const B = 'file:///b.jpg';
const basePayload = { org_id: 'org1', work_order_id: 'wo1', log_date: '2026-11-27', note: 'filled pothole', progress_pct: 50 };

async function queue(photos: string[]) {
  const id = await enqueue('work_log', 'WO-1', { ...basePayload, photos });
  // enqueue() fires a background flush (guarded by a `running` flag); wait for it to finish.
  for (let n = 0; n < 50 && useOutbox.getState().syncing; n++) await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  return id;
}

beforeEach(() => {
  mockRows.clear();
  mockFiles.clear();
  upload.mockReset();
  rpc.mockReset();
  upload.mockImplementation(async (_b: string, path: string) => path);
  rpc.mockResolvedValue({ data: 'log-1', error: null });
});

describe('field outbox work-log evidence', () => {
  it('uploads all photos then sends with stable paths and client id', async () => {
    mockFiles.add(A); mockFiles.add(B);
    const id = await queue([A, B]);
    expect(mockRows.get(id)!.status).toBe('sent');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_client_id: id,
      p_photo_paths: [`org1/${MOCK_UID}/${id}-0.jpg`, `org1/${MOCK_UID}/${id}-1.jpg`],
    });
  });

  it('a genuinely photo-less log still sends', async () => {
    const id = await queue([]);
    expect(mockRows.get(id)!.status).toBe('sent');
    expect(rpc.mock.calls[0][1].p_photo_paths).toEqual([]);
    expect(upload).not.toHaveBeenCalled();
  });

  it.each([
    ['first', [false, true]],
    ['second', [true, false]],
  ])('missing %s photo: not sent, no RPC, no uploads, failed with EVIDENCE_PHOTO_MISSING', async (_n, present) => {
    if (present[0]) mockFiles.add(A);
    if (present[1]) mockFiles.add(B);
    const id = await queue([A, B]);
    const r = mockRows.get(id)!;
    expect(r.status).toBe('failed');
    expect(r.last_error).toBe('EVIDENCE_PHOTO_MISSING');
    expect(rpc).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('a failed item is not retried automatically (no retry spam) but is kept', async () => {
    mockFiles.add(A);
    const id = await queue([A, B]);
    const attempts = mockRows.get(id)!.attempts;
    await flushOutbox();
    await flushOutbox();
    expect(mockRows.get(id)!.attempts).toBe(attempts);
    expect(mockRows.get(id)!.status).toBe('failed');
  });

  it('restoring the file and retrying sends all N photos', async () => {
    mockFiles.add(A);
    const id = await queue([A, B]);
    mockFiles.add(B);
    await flushOutbox(true);
    expect(mockRows.get(id)!.status).toBe('sent');
    expect(rpc.mock.calls[0][1].p_photo_paths).toHaveLength(2);
  });

  it('removeMissingPhotos is an explicit action that drops only broken attachments and re-queues', async () => {
    mockFiles.add(A);
    const id = await queue([A, B]);
    expect(await removeMissingPhotos(id)).toBe(1);
    for (let n = 0; n < 50 && useOutbox.getState().syncing; n++) await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    await flushOutbox(true);
    expect(mockRows.get(id)!.status).toBe('sent');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][1].p_photo_paths).toEqual([`org1/${MOCK_UID}/${id}-0.jpg`]);
  });

  it('removeMissingPhotos does nothing when no attachment is missing', async () => {
    mockFiles.add(A); mockFiles.add(B);
    upload.mockRejectedValue(new TypeError('Network request failed'));
    const id = await queue([A, B]);
    expect(await removeMissingPhotos(id)).toBe(0);
    expect(mockRows.get(id)!.status).toBe('queued');
  });

  it('failed second upload: stays queued with backoff, no RPC; retry recovers with same id and paths', async () => {
    mockFiles.add(A); mockFiles.add(B);
    upload.mockImplementationOnce(async (_b: string, p: string) => p)
      .mockRejectedValueOnce(new TypeError('Network request failed'));
    const id = await queue([A, B]);
    const r = mockRows.get(id)!;
    expect(r.status).toBe('queued');
    expect(r.last_error).toBe('network');
    expect(r.next_attempt_at).toBeGreaterThan(Date.now());
    expect(rpc).not.toHaveBeenCalled();

    await flushOutbox(); // not yet due: nothing happens
    expect(rpc).not.toHaveBeenCalled();

    await flushOutbox(true); // retry succeeds
    expect(mockRows.get(id)!.status).toBe('sent');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][1].p_client_id).toBe(id);
    const paths = upload.mock.calls.map((c) => c[1]);
    expect(paths.slice(-2)).toEqual([`org1/${MOCK_UID}/${id}-0.jpg`, `org1/${MOCK_UID}/${id}-1.jpg`]);
  });

  it('RPC failure after uploads keeps the entry unsent; the retry reuses the client id', async () => {
    mockFiles.add(A);
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } });
    const id = await queue([A]);
    expect(mockRows.get(id)!.status).toBe('queued');
    await flushOutbox(true);
    expect(mockRows.get(id)!.status).toBe('sent');
    expect(rpc.mock.calls.map((c) => c[1].p_client_id)).toEqual([id, id]);
  });
});
