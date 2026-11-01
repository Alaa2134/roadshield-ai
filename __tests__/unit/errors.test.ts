import { AppError, errorCode, isNetworkError, unwrap } from '@/lib/errors';

describe('error mapping', () => {
  it.each([
    [{ message: 'RATE_LIMITED' }, 'RATE_LIMITED'],
    [{ message: 'Invalid login credentials' }, 'invalidCredentials'],
    [{ message: 'Email not confirmed' }, 'emailNotConfirmed'],
    [{ message: 'User already registered' }, 'userExists'],
    [{ message: 'Network request failed' }, 'network'],
    [new TypeError('x'), 'network'],
    [{ message: 'something odd' }, 'generic'],
    [new AppError('NOT_FOUND'), 'NOT_FOUND'],
  ])('%o -> %s', (err, code) => {
    expect(errorCode(err)).toBe(code);
  });

  it('unwrap throws typed errors and passes data through', () => {
    expect(unwrap({ data: 5, error: null })).toBe(5);
    expect(() => unwrap({ data: null, error: { message: 'LAST_ADMIN' } })).toThrow(AppError);
    try {
      unwrap({ data: null, error: { message: 'Failed to fetch' } });
    } catch (e) {
      expect((e as AppError).retryable).toBe(true);
      expect(isNetworkError(e)).toBe(true);
    }
  });
});
