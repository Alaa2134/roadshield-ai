import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/ui/client';
import { Field } from '@/components/ui';
import { signUp } from '@/lib/actions/auth';
import { getDict } from '@/lib/i18n/server';

export const metadata: Metadata = { title: 'Create account', robots: { index: false } };

export default async function SignUp() {
  const { t, locale } = await getDict();
  return (
    <>
      <h1 className="t-page">{t.auth.signUp}</h1>
      <p className="mt-1.5 text-sm text-ink-2">{t.auth.createBody}</p>
      <ActionForm action={signUp} errors={t.errors} success={t.auth.checkEmail} className="mt-7 space-y-4" testId="sign-up-form">
        <input type="hidden" name="locale" value={locale} />
        <Field label={t.auth.fullName} name="full_name" required><input id="full_name" name="full_name" className="input" required minLength={2} maxLength={80} autoComplete="name" /></Field>
        <Field label={t.auth.email} name="email" required><input id="email" name="email" type="email" className="input" required autoComplete="email" /></Field>
        <Field label={t.auth.password} name="password" required hint={t.auth.passwordHint}><input id="password" name="password" type="password" className="input" required minLength={10} maxLength={72} autoComplete="new-password" /></Field>
        <SubmitButton className="w-full" size="lg">{t.auth.signUp}</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-center text-sm text-ink-2">{t.auth.haveAccount} <Link href="/sign-in" className="font-[560] text-accent-text hover:underline">{t.auth.signIn}</Link></p>
    </>
  );
}
