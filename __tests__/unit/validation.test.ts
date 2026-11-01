import { reportSchema, resetSchema, signInSchema, signUpSchema } from '@/lib/validation';

describe('validation', () => {
  it('normalises e-mail addresses', () => {
    expect(signInSchema.parse({ email: '  Alaa@Example.COM ', password: 'x' }).email).toBe('alaa@example.com');
    expect(signInSchema.safeParse({ email: 'not-an-email', password: 'x' }).success).toBe(false);
  });

  it.each([
    ['short1', false],
    ['onlyletters', false],
    ['12345678', false],
    ['roadshield1', true],
    ['طريقآمن٢٠٢٦', true], // Arabic letters with Arabic-Indic digits
  ])('password %s valid=%s', (password, ok) => {
    expect(resetSchema.safeParse({ password, confirm: password }).success).toBe(ok);
  });

  it('requires matching confirmation on sign-up', () => {
    const base = { fullName: 'Alaa Saber', email: 'a@b.co', password: 'roadshield1' };
    expect(signUpSchema.safeParse({ ...base, confirm: 'roadshield1' }).success).toBe(true);
    const bad = signUpSchema.safeParse({ ...base, confirm: 'other' });
    expect(bad.success).toBe(false);
    expect(bad.error!.issues[0]!.message).toBe('auth.v_match');
  });

  const report = { category: 'pothole', severity: 'high', description: 'Deep pothole', latitude: 31.42, longitude: 31.66, photos: [{ uri: 'file:///a.jpg' }] };
  it('accepts a complete report', () => {
    expect(reportSchema.safeParse(report).success).toBe(true);
  });
  it.each([
    ['no photos', { photos: [] }],
    ['seven photos', { photos: Array.from({ length: 7 }, () => ({ uri: 'f' })) }],
    ['bad latitude', { latitude: 91 }],
    ['unknown category', { category: 'ufo' }],
    ['long description', { description: 'x'.repeat(1001) }],
  ])('rejects a report with %s', (_n, patch) => {
    expect(reportSchema.safeParse({ ...report, ...patch }).success).toBe(false);
  });
});
