/**
 * Report submission workflow: photo upload → idempotent RPC → local state, including the
 * offline queue behaviour (retry with backoff, resume partially uploaded mockDrafts, stop on
 * permanent errors). Supabase, storage and the on-device database are replaced with fakes.
 */
import type { Draft, DraftData } from '@/lib/offline/drafts';

const MOCK_UID = '11111111-1111-4111-8111-111111111111';
const mockDrafts = new Map<string, Draft>();

jest.mock('@/lib/supabase', () => ({
  HAZARD_BUCKET: 'hazard-images',
  supabase: {
    auth: {
      getUser: jest.fn(async () => ({ data: { user: { id: MOCK_UID } } })),
      getSession: jest.fn(async () => ({ data: { session: { user: { id: MOCK_UID } } } })),
    },
    rpc: jest.fn(),
  },
}));
jest.mock('@/lib/api/storage', () => ({ uploadJpeg: jest.fn(async () => undefined) }));
jest.mock('@/lib/images', () => ({ fileExists: jest.fn(() => true), deleteDraftFiles: jest.fn() }));
jest.mock('@/lib/offline/db', () => ({
  getDb: jest.fn(async () => ({
    getAllAsync: async () =>
      [...mockDrafts.values()]
        .filter((d) => d.status === 'queued' && d.nextAttemptAt <= Date.now())
        .map((d) => ({ id: d.id })),
  })),
}));
jest.mock('@/lib/offline/drafts', () => ({
  getDraft: jest.fn(async (id: string) => mockDrafts.get(id) ?? null),
  updateDraft: jest.fn(async (id: string, patch: Partial<Draft>) => {
    const d = mockDrafts.get(id);
    if (d) mockDrafts.set(id, { ...d, ...patch, updatedAt: Date.now() });
  }),
}));

// eslint-disable-next-line import/first
import { uploadJpeg } from '@/lib/api/storage';
// eslint-disable-next-line import/first
import { deleteDraftFiles } from '@/lib/images';
// eslint-disable-next-line import/first
import { backoff, processQueue, submitDraft, submitNow } from '@/lib/offline/sync';
// eslint-disable-next-line import/first
import { supabase } from '@/lib/supabase';

const rpc = supabase.rpc as jest.Mock;
const upload = uploadJpeg as jest.Mock;

function makeDraft(id: string, patch: Partial<DraftData> = {}, status: Draft['status'] = 'queued'): Draft {
  const data: DraftData = {
    photos: [
      { uri: 'file:///mockDrafts/a/photo-0.jpg', width: 1600, height: 1200, privacyBlurred: true },
      { uri: 'file:///mockDrafts/a/photo-1.jpg', width: 1200, height: 1600 },
    ],
    ai: null,
    category: 'pothole',
    severity: 'high',
    description: '  Deep pothole by the school gate  ',
    latitude: 31.4368,
    longitude: 31.667,
    locationSource: 'gps',
    accuracy: 6,
    address: 'Central district',
    city: 'New Damietta',
    ...patch,
  };
  const d: Draft = {
    id,
    userId: MOCK_UID,
    status,
    data,
    attempts: 0,
    lastError: null,
    nextAttemptAt: 0,
    remoteId: null,
    publicCode: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  mockDrafts.set(id, d);
  return d;
}

const ok = (id = 'hz-1') => ({
  data: { id, public_code: 'RS-2610-00042', status: 'submitted', already_submitted: false, ai_verified: false },
  error: null,
});

beforeEach(() => {
  mockDrafts.clear();
  jest.clearAllMocks();
});

describe('submitDraft', () => {
  it('uploads every photo to the owner folder, then submits once with server-side validation fields', async () => {
    rpc.mockResolvedValueOnce(ok());
    const d = makeDraft('d1');
    const res = await submitDraft(d);

    expect(upload.mock.calls.map((c) => c[1])).toEqual([`${MOCK_UID}/d1/0.jpg`, `${MOCK_UID}/d1/1.jpg`]);
    expect(rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = rpc.mock.calls[0]!;
    expect(fn).toBe('submit_hazard_report');
    expect(args).toMatchObject({
      p_client_draft_id: 'd1',
      p_category: 'pothole',
      p_severity: 'high',
      p_description: 'Deep pothole by the school gate',
      p_latitude: 31.4368,
      p_longitude: 31.667,
      p_location_source: 'gps',
      p_ai_payload: null,
      p_ai_signature: null,
    });
    expect(args.p_images).toEqual([
      { path: `${MOCK_UID}/d1/0.jpg`, width: 1600, height: 1200, privacy_blurred: true },
      { path: `${MOCK_UID}/d1/1.jpg`, width: 1200, height: 1600, privacy_blurred: false },
    ]);
    expect(res.public_code).toBe('RS-2610-00042');
    expect(mockDrafts.get('d1')).toMatchObject({ status: 'submitted', remoteId: 'hz-1', publicCode: 'RS-2610-00042' });
    expect(deleteDraftFiles).toHaveBeenCalledWith('d1');
  });

  it('resumes a partially uploaded draft without re-sending finished photos', async () => {
    rpc.mockResolvedValueOnce(ok());
    const d = makeDraft('d2');
    d.data.photos[0]!.uploadedPath = `${MOCK_UID}/d2/0.jpg`;
    await submitDraft(d);
    expect(upload.mock.calls.map((c) => c[1])).toEqual([`${MOCK_UID}/d2/1.jpg`]);
  });

  it('forwards a signed AI result unchanged, and never an unavailable one', async () => {
    rpc.mockResolvedValue(ok());
    await submitDraft(makeDraft('d3', { ai: { state: 'ok', payload: '{"detection_id":"x"}', signature: 'abc123' } }));
    expect(rpc.mock.calls[0]![1]).toMatchObject({ p_ai_payload: '{"detection_id":"x"}', p_ai_signature: 'abc123' });

    await submitDraft(makeDraft('d4', { ai: { state: 'unavailable', payload: 'forged', signature: 'forged' } }));
    expect(rpc.mock.calls[1]![1]).toMatchObject({ p_ai_payload: null, p_ai_signature: null });
  });

  it('refuses to send a draft that belongs to another account', async () => {
    const d = { ...makeDraft('d5'), userId: 'someone-else' };
    await expect(submitDraft(d)).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' });
    expect(upload).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['no photos', { photos: [] }, 'IMAGES_REQUIRED'],
    ['no location', { latitude: null }, 'INVALID_LOCATION'],
    ['no category', { category: null }, 'VALIDATION_ERROR'],
  ] as const)('validates before uploading (%s)', async (_n, patch, code) => {
    await expect(submitDraft(makeDraft('d6', patch as Partial<DraftData>))).rejects.toMatchObject({ code });
    expect(upload).not.toHaveBeenCalled();
  });

  it('treats an already-attached photo as uploaded and lets the idempotent RPC answer', async () => {
    upload.mockRejectedValueOnce({ message: 'NOT_AUTHORIZED' });
    rpc.mockResolvedValueOnce({ data: { ...ok().data, already_submitted: true }, error: null });
    const res = await submitDraft(makeDraft('d7'));
    expect(res.already_submitted).toBe(true);
  });
});

describe('submitNow + offline queue', () => {
  it('queues the draft with backoff when the network drops', async () => {
    upload.mockRejectedValueOnce(new TypeError('Network request failed'));
    makeDraft('q1', {}, 'draft');
    const before = Date.now();
    const res = await submitNow('q1');
    expect(res).toEqual({ ok: false, code: 'network', queued: true });
    const d = mockDrafts.get('q1')!;
    expect(d).toMatchObject({ status: 'queued', attempts: 1, lastError: 'network' });
    expect(d.nextAttemptAt).toBeGreaterThanOrEqual(before + backoff(1));
  });

  it('marks permanent server errors as failed for the user to review', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'ACCOUNT_SUSPENDED' } });
    makeDraft('q2', {}, 'draft');
    const res = await submitNow('q2');
    expect(res).toMatchObject({ ok: false, code: 'ACCOUNT_SUSPENDED', queued: false });
    expect(mockDrafts.get('q2')!.status).toBe('failed');
  });

  it('syncs queued mockDrafts once connectivity returns', async () => {
    rpc.mockResolvedValueOnce(ok('a')).mockResolvedValueOnce(ok('b'));
    makeDraft('s1');
    makeDraft('s2');
    makeDraft('s3', {}, 'draft'); // unsent local draft: not touched by the queue
    const sent = await processQueue();
    expect(sent).toBe(2);
    expect(mockDrafts.get('s1')!.status).toBe('submitted');
    expect(mockDrafts.get('s2')!.status).toBe('submitted');
    expect(mockDrafts.get('s3')!.status).toBe('draft');
  });

  it('stops the batch on a network error and keeps the rest queued', async () => {
    upload.mockRejectedValueOnce(new TypeError('Network request failed'));
    makeDraft('n1');
    makeDraft('n2');
    expect(await processQueue()).toBe(0);
    expect(mockDrafts.get('n1')).toMatchObject({ status: 'queued', attempts: 1 });
    expect(mockDrafts.get('n2')).toMatchObject({ status: 'queued', attempts: 0 });
  });

  it('backs off exponentially from 30 s up to 30 min', () => {
    expect([1, 2, 3, 4].map(backoff)).toEqual([30_000, 60_000, 120_000, 240_000]);
    expect(backoff(20)).toBe(30 * 60_000);
  });
});
