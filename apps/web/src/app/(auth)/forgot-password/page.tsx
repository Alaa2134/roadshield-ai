import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/ui/client';
import { Field } from '@/components/ui';
import { requestReset } from '@/lib/actions/auth';
import { getDict } from '@/lib/i18n/server';

export const metadata: Metadata = { title: 'Reset password', robots: { index: false } };

export default async function Forgot() {
  const { t } = await getDict();
  return (
    <>
      <h1 className="t-page">{t.auth.forgot}</h1>
      <ActionForm action={requestReset} errors={t.errors} success={t.auth.resetSent} className="mt-7 space-y-4">
        <Field label={t.auth.email} name="email" required><input id="email" name="email" type="email" className="input" required autoComplete="email" /></Field>
        <SubmitButton className="w-full" size="lg">{t.auth.reset}</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-center text-sm"><Link href="/sign-in" className="font-[560] text-accent-text hover:underline">{t.auth.signIn}</Link></p>
    </>
  );
}
