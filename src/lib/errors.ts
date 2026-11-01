import i18n from 'i18next';

const KNOWN = new Set([
  'NOT_AUTHENTICATED',
  'NOT_AUTHORIZED',
  'ACCOUNT_SUSPENDED',
  'RATE_LIMITED',
  'INVALID_LOCATION',
  'IMAGES_REQUIRED',
  'IMAGE_NOT_UPLOADED',
  'INVALID_IMAGE_PATH',
  'VALIDATION_ERROR',
  'HAZARD_NOT_ACTIVE',
  'CANNOT_CONFIRM_OWN',
  'INVALID_TRANSITION',
  'USE_DEDICATED_ACTION',
  'ALREADY_ASSIGNED',
  'INVALID_ASSIGNEE',
  'TASK_CLOSED',
  'TOO_MANY_IMAGES',
  'LAST_ADMIN',
  'CANNOT_SUSPEND_SELF',
  'SAVED_LOCATIONS_LIMIT',
  'NOT_FOUND',
]);

export class AppError extends Error {
  constructor(
    public code: string,
    message?: string,
    public retryable = false,
  ) {
    super(message ?? code);
    this.name = 'AppError';
  }
}

/** Extracts a server error code (raised by our SQL functions) from a Supabase/PostgREST error. */
export function errorCode(error: unknown): string {
  if (error instanceof AppError) return error.code;
  const e = error as { message?: string; code?: string; status?: number; name?: string } | null;
  const msg = e?.message ?? '';
  if (KNOWN.has(msg)) return msg;
  if (/invalid login credentials/i.test(msg)) return 'invalidCredentials';
  if (/email not confirmed/i.test(msg)) return 'emailNotConfirmed';
  if (/already registered|already exists/i.test(msg)) return 'userExists';
  if (/password/i.test(msg) && /(weak|short|least)/i.test(msg)) return 'weakPassword';
  if (/network request failed|fetch failed|timeout|Failed to fetch|aborted/i.test(msg) || e?.name === 'TypeError')
    return 'network';
  return 'generic';
}

export function isNetworkError(error: unknown): boolean {
  return errorCode(error) === 'network';
}

/** Translated, user-facing message for any error. */
export function errorMessage(error: unknown): string {
  const code = errorCode(error);
  const key = `errors.${code}`;
  return i18n.exists(key) ? i18n.t(key) : i18n.t('errors.generic');
}

/** Throws a typed error for a Supabase response error, otherwise returns data. */
export function unwrap<T>(res: { data: T; error: unknown }): T {
  if (res.error) {
    const msg = (res.error as { message?: string }).message ?? 'generic';
    throw new AppError(KNOWN.has(msg) ? msg : errorCode(res.error), msg, isNetworkError(res.error));
  }
  return res.data;
}
