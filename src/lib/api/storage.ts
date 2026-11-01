import { File, UploadType } from 'expo-file-system';
import { env } from '../env';
import { AppError } from '../errors';
import { supabase } from '../supabase';

/**
 * Uploads a local JPEG to a private Supabase Storage bucket with real byte-level progress.
 * Uses the Storage REST endpoint directly so the native uploader can report progress.
 * `upsert` makes retries idempotent for objects not yet attached to a report.
 */
export async function uploadJpeg(
  bucket: string,
  path: string,
  localUri: string,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AppError('NOT_AUTHENTICATED');

  const encoded = path.split('/').map(encodeURIComponent).join('/');
  const url = `${env.supabaseUrl}/storage/v1/object/${bucket}/${encoded}`;
  const task = new File(localUri).createUploadTask(url, {
    httpMethod: 'POST',
    uploadType: UploadType.BINARY_CONTENT,
    mimeType: 'image/jpeg',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: env.supabaseKey,
      'Content-Type': 'image/jpeg',
      'x-upsert': 'true',
      'cache-control': 'max-age=3600',
    },
    onProgress: ({ bytesSent, totalBytes }) => {
      if (onProgress && totalBytes > 0) onProgress(Math.min(1, bytesSent / totalBytes));
    },
  });

  let result: { status: number; body: string };
  try {
    result = await task.uploadAsync();
  } catch (error) {
    throw new AppError('network', String(error), true);
  }
  if (result.status >= 200 && result.status < 300) return path;
  if (result.status === 401) throw new AppError('NOT_AUTHENTICATED', result.body);
  if (result.status === 403) throw new AppError('NOT_AUTHORIZED', result.body);
  if (result.status === 413) throw new AppError('VALIDATION_ERROR', 'image too large');
  throw new AppError('generic', `upload_http_${result.status}: ${result.body}`, result.status >= 500);
}

/** Short-lived signed URLs for private images; storage policies decide who may read. */
export async function signedUrls(bucket: string, paths: string[], expiresIn = 3600): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, expiresIn);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item.signedUrl && item.path) out[item.path] = item.signedUrl;
  }
  return out;
}
