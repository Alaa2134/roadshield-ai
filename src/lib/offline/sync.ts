import { create } from 'zustand';
import { uploadJpeg } from '../api/storage';
import { AppError, errorCode } from '../errors';
import { deleteDraftFiles, fileExists } from '../images';
import { HAZARD_BUCKET, supabase } from '../supabase';
import { getDb } from './db';
import { getDraft, updateDraft, type Draft } from './drafts';

/**
 * Upload queue for hazard reports.
 *
 * Reliability rules:
 *  - Each draft has a stable client id; `submit_hazard_report` is idempotent on it, so a retry
 *    after a lost response can never create a duplicate report (server returns the original).
 *  - Photos upload to <uid>/<draftId>/<n>.jpg with upsert; the uploaded path is persisted after
 *    every photo so a retry resumes where it stopped.
 *  - Network/5xx failures retry with exponential backoff (30 s → 30 min). Validation and
 *    permission failures stop and are shown to the user ("Upload failed") for review.
 *  - The server is authoritative: drafts are locked while queued and cannot be edited.
 */
export type SubmitResult = { id: string; public_code: string; status: string; already_submitted: boolean; ai_verified: boolean };

type Progress = { draftId: string; current: number; total: number; fraction: number } | null;
export const useUploadProgress = create<{ progress: Progress; set: (p: Progress) => void }>((set) => ({
  progress: null,
  set: (progress) => set({ progress }),
}));

export const RETRYABLE = new Set(['network', 'generic', 'RATE_LIMITED', 'IMAGE_NOT_UPLOADED']);
const MAX_AUTO_ATTEMPTS = 8;

/** Retry delay after the n-th failed attempt: 30 s, 1 min, 2 min … capped at 30 min. */
export function backoff(attempts: number) {
  return Math.min(30 * 60_000, 30_000 * 2 ** Math.max(0, attempts - 1));
}

export async function submitDraft(draft: Draft): Promise<SubmitResult> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new AppError('NOT_AUTHENTICATED');
  if (uid !== draft.userId) throw new AppError('NOT_AUTHORIZED', 'draft belongs to another account');

  const d = draft.data;
  if (d.photos.length === 0) throw new AppError('IMAGES_REQUIRED');
  if (d.latitude == null || d.longitude == null) throw new AppError('INVALID_LOCATION');
  if (!d.category || !d.severity) throw new AppError('VALIDATION_ERROR');

  await updateDraft(draft.id, { status: 'uploading', lastError: null });
  const photos = [...d.photos];
  const progress = useUploadProgress.getState();

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i]!;
    if (photo.uploadedPath) continue;
    if (!fileExists(photo.uri)) throw new AppError('IMAGE_NOT_UPLOADED', 'local photo missing');
    const path = `${uid}/${draft.id}/${i}.jpg`;
    progress.set({ draftId: draft.id, current: i + 1, total: photos.length, fraction: 0 });
    try {
      await uploadJpeg(HAZARD_BUCKET, path, photo.uri, (fraction) =>
        progress.set({ draftId: draft.id, current: i + 1, total: photos.length, fraction }),
      );
    } catch (error) {
      // If the object is already attached to a submitted report, overwriting is refused.
      // The idempotent submit below will then return the existing report.
      if (errorCode(error) !== 'NOT_AUTHORIZED') throw error;
    }
    photos[i] = { ...photo, uploadedPath: path };
    await updateDraft(draft.id, { data: { ...d, photos } });
  }
  progress.set(null);

  const res = await supabase.rpc('submit_hazard_report', {
    p_client_draft_id: draft.id,
    p_category: d.category,
    p_severity: d.severity,
    p_description: d.description.trim(),
    p_latitude: d.latitude,
    p_longitude: d.longitude,
    p_location_source: d.locationSource,
    p_location_accuracy_m: d.accuracy,
    p_address: d.address,
    p_city: d.city,
    p_images: photos.map((p) => ({
      path: p.uploadedPath,
      width: p.width,
      height: p.height,
      privacy_blurred: !!p.privacyBlurred,
    })),
    p_ai_payload: d.ai?.state === 'ok' ? (d.ai.payload ?? null) : null,
    p_ai_signature: d.ai?.state === 'ok' ? (d.ai.signature ?? null) : null,
  });
  if (res.error) throw new AppError(errorCode(res.error), res.error.message);
  const result = res.data as SubmitResult;
  await updateDraft(draft.id, {
    status: 'submitted',
    remoteId: result.id,
    publicCode: result.public_code,
    lastError: null,
    data: { ...d, photos },
  });
  deleteDraftFiles(draft.id);
  return result;
}

/**
 * Submits one draft right away (used by the "Submit report" button). On a retryable failure
 * the draft stays queued for automatic retry; otherwise it is marked failed for review.
 */
export async function submitNow(id: string): Promise<{ ok: true; result: SubmitResult } | { ok: false; code: string; queued: boolean }> {
  const draft = await getDraft(id);
  if (!draft) return { ok: false, code: 'NOT_FOUND', queued: false };
  try {
    return { ok: true, result: await submitDraft(draft) };
  } catch (error) {
    const code = errorCode(error);
    const retry = RETRYABLE.has(code);
    await updateDraft(id, {
      status: retry ? 'queued' : 'failed',
      attempts: draft.attempts + 1,
      lastError: code,
      nextAttemptAt: Date.now() + backoff(draft.attempts + 1),
    });
    useUploadProgress.getState().set(null);
    return { ok: false, code, queued: retry };
  }
}

let running = false;

/** Processes queued drafts for the signed-in user. Safe to call often. */
export async function processQueue(force = false): Promise<number> {
  if (running) return 0;
  running = true;
  let sent = 0;
  try {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) return 0;
    const db = await getDb();
    const rows = await db.getAllAsync<{ id: string }>(
      `SELECT id FROM drafts WHERE user_id = ? AND status IN ('queued','failed')
         AND (? = 1 OR (status = 'queued' AND next_attempt_at <= ?)) ORDER BY created_at`,
      uid,
      force ? 1 : 0,
      Date.now(),
    );
    for (const { id } of rows) {
      const draft = await getDraft(id);
      if (!draft) continue;
      try {
        await submitDraft(draft);
        sent += 1;
      } catch (error) {
        const code = errorCode(error);
        const attempts = draft.attempts + 1;
        const retry = RETRYABLE.has(code) && attempts < MAX_AUTO_ATTEMPTS;
        await updateDraft(id, {
          status: retry ? 'queued' : 'failed',
          attempts,
          lastError: code,
          nextAttemptAt: Date.now() + backoff(attempts),
        });
        useUploadProgress.getState().set(null);
        if (code === 'network') break; // stop the batch; we'll resume when back online
      }
    }
  } finally {
    running = false;
  }
  return sent;
}
