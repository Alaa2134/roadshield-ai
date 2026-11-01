import { env, isAiConfigured } from './env';
import { supabase } from './supabase';
import type { Detection, HazardCategory } from './types';

/**
 * Client for the RoadShield FastAPI inference service (services/ai).
 *
 * Every result comes from the trained model running on the server. The app never fabricates
 * detections: if the service is not configured, unreachable, has no model loaded, or fails,
 * callers receive an explicit "unavailable"/"failed" outcome and the UI offers manual entry.
 */
export type AiAnalysis = {
  detectionId: string;
  modelName: string;
  modelVersion: string;
  topCategory: Extract<HazardCategory, 'pothole' | 'crack' | 'surface_damage'> | null;
  topConfidence: number | null;
  detections: Detection[];
  inferenceMs: number;
  imageWidth: number;
  imageHeight: number;
  /** Exact signed JSON string + HMAC — forwarded unchanged to the database for verification. */
  payload: string;
  signature: string;
  privacy: { faces: number; plates: number; applied: boolean };
  redactedImageBase64: string | null;
};

export type AiOutcome =
  | { kind: 'ok'; analysis: AiAnalysis }
  | { kind: 'not_configured' }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'failed'; reason: string };

/** Below this confidence the UI asks the user to double-check the suggestion. */
export const LOW_CONFIDENCE = 0.5;

async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

export async function aiHealth(): Promise<{ ok: boolean; modelLoaded: boolean; modelName?: string; modelVersion?: string }> {
  if (!isAiConfigured) return { ok: false, modelLoaded: false };
  try {
    const res = await withTimeout(5000, (signal) => fetch(`${env.aiApiUrl}/health`, { signal }));
    if (!res.ok) return { ok: false, modelLoaded: false };
    const body = (await res.json()) as { model_loaded?: boolean; model_name?: string; model_version?: string };
    return { ok: true, modelLoaded: !!body.model_loaded, modelName: body.model_name, modelVersion: body.model_version };
  } catch {
    return { ok: false, modelLoaded: false };
  }
}

type AnalyzeResponse = {
  payload: string;
  signature: string;
  privacy?: { faces: number; plates: number; applied: boolean };
  redacted_image_b64?: string | null;
};

type SignedResult = {
  detection_id: string;
  model_name: string;
  model_version: string;
  top_category: AiAnalysis['topCategory'];
  top_confidence: number | null;
  detections: Detection[];
  inference_ms: number;
  image_width: number;
  image_height: number;
};

export async function analyzeImage(uri: string): Promise<AiOutcome> {
  if (!isAiConfigured) return { kind: 'not_configured' };
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { kind: 'failed', reason: 'no_session' };

  const form = new FormData();
  // React Native's FormData accepts a { uri, name, type } descriptor for file parts.
  form.append('image', { uri, name: 'hazard.jpg', type: 'image/jpeg' } as unknown as Blob);

  let res: Response;
  try {
    res = await withTimeout(30000, (signal) =>
      fetch(`${env.aiApiUrl}/v1/analyze`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        body: form,
        signal,
      }),
    );
  } catch (error) {
    return { kind: 'unavailable', reason: String(error) };
  }

  if (res.status === 503) return { kind: 'unavailable', reason: 'model_not_loaded' };
  if (!res.ok) return { kind: 'failed', reason: `http_${res.status}` };

  try {
    const body = (await res.json()) as AnalyzeResponse;
    const r = JSON.parse(body.payload) as SignedResult;
    return {
      kind: 'ok',
      analysis: {
        detectionId: r.detection_id,
        modelName: r.model_name,
        modelVersion: r.model_version,
        topCategory: r.top_category,
        topConfidence: r.top_confidence,
        detections: r.detections ?? [],
        inferenceMs: r.inference_ms,
        imageWidth: r.image_width,
        imageHeight: r.image_height,
        payload: body.payload,
        signature: body.signature,
        privacy: body.privacy ?? { faces: 0, plates: 0, applied: false },
        redactedImageBase64: body.redacted_image_b64 ?? null,
      },
    };
  } catch (error) {
    return { kind: 'failed', reason: `bad_response: ${String(error)}` };
  }
}
