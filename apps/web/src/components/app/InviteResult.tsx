'use client';
import { useActionState, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { runRpc } from '@/lib/actions/rpc';
import type { ActionResult } from '@/components/ui/client';
import { SubmitButton } from '@/components/ui/client';
import type { Dict } from '@/lib/i18n/dict';

export function InviteResult({ orgId, t, labels, roles, contractors }: { orgId: string; t: Dict; labels: Record<string, string>; roles: { value: string; label: string }[]; contractors: { id: string; name: string }[] }) {
  const [state, action] = useActionState<ActionResult, FormData>(runRpc, null);
  const [role, setRole] = useState('road_engineer');
  const [copied, setCopied] = useState(false);
  const token = state?.ok && state.message?.startsWith('TOKEN:') ? state.message.slice(6) : null;
  return (
    <form action={action} className="grid gap-3" data-testid="invite-form">
      <input type="hidden" name="_rpc" value="invite_member" /><input type="hidden" name="p_org" value={orgId} /><input type="hidden" name="_revalidate" value="/app/organization/members" />
      <label><span className="mb-1.5 block text-[13px] font-[560]">{labels.email}</span><input name="p_email" type="email" className="input" required /></label>
      <label><span className="mb-1.5 block text-[13px] font-[560]">{labels.role}</span>
        <select name="p_role" className="select" value={role} onChange={(e) => setRole(e.target.value)}>{roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></label>
      {role === 'contractor' ? <label><span className="mb-1.5 block text-[13px] font-[560]">{labels.contractor}</span><select name="p_contractor_id" className="select" required>{contractors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label> : null}
      <div className="flex justify-end"><SubmitButton size="sm">{labels.invite}</SubmitButton></div>
      {state && !state.ok ? <p className="rounded-lg bg-crit-soft px-3 py-2 text-[13px] text-crit-text" role="alert">{t.errors[state.error as keyof typeof t.errors] ?? t.errors.generic}</p> : null}
      {token ? (
        <div className="rounded-xl border border-ok/30 bg-ok-soft p-3 text-[13px] text-ok-text" data-testid="invite-token">
          <p>{labels.token}</p>
          <div className="mt-2 flex items-center gap-2"><code className="min-w-0 flex-1 truncate rounded bg-surface px-2 py-1 font-mono text-xs text-ink">{token}</code>
            <button type="button" className="btn btn-sm btn-secondary px-2" onClick={() => { navigator.clipboard.writeText(token); setCopied(true); }} aria-label="Copy">{copied ? <Check size={14} /> : <Copy size={14} />}</button></div>
        </div>
      ) : null}
    </form>
  );
}
