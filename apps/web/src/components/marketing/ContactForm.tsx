import { ActionForm, SubmitButton } from '@/components/ui/client';
import { Field } from '@/components/ui';
import { submitContact } from '@/lib/actions/contact';
import { marketing } from '@/lib/i18n/marketing';
import { dictionaries, type Locale } from '@/lib/i18n/dict';

export function ContactForm({ locale, kind }: { locale: Locale; kind: 'contact' | 'demo' }) {
  const c = marketing[locale].contact;
  const t = dictionaries[locale];
  return (
    <ActionForm action={submitContact} errors={t.errors} success={c.sent} resetOnSuccess testId="contact-form" className="space-y-4">
      <input type="hidden" name="kind" value={kind} />
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={c.name} name="full_name" required><input id="full_name" name="full_name" className="input" required minLength={2} maxLength={120} autoComplete="name" /></Field>
        <Field label={c.email} name="email" required><input id="email" name="email" type="email" className="input" required autoComplete="email" /></Field>
        <Field label={c.organization} name="organization"><input id="organization" name="organization" className="input" autoComplete="organization" /></Field>
        <Field label={c.country} name="country"><input id="country" name="country" className="input" autoComplete="country-name" /></Field>
        <Field label={c.role} name="job_role"><input id="job_role" name="job_role" className="input" autoComplete="organization-title" /></Field>
        <Field label={c.interest} name="interest">
          <select id="interest" name="interest" className="select" defaultValue={kind === 'demo' ? 'demo' : 'other'}>
            {Object.entries(c.interests).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </div>
      <Field label={c.message} name="message"><textarea id="message" name="message" className="textarea" rows={5} maxLength={4000} /></Field>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-3">{c.privacy}</p>
        <SubmitButton size="lg" testId="contact-submit">{c.send}</SubmitButton>
      </div>
    </ActionForm>
  );
}
