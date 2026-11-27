import type { ReactNode } from 'react';
import { ActionForm, SubmitButton } from '@/components/ui/client';
import { runRpc } from '@/lib/actions/rpc';
import type { Dict } from '@/lib/i18n/dict';

export function RpcForm({ rpc, t, children, hidden = {}, revalidate, redirect, success, className, resetOnSuccess, testId }: {
  rpc: string; t: Dict; children: ReactNode; hidden?: Record<string, string | null | undefined>; revalidate?: string | string[];
  redirect?: string; success?: string; className?: string; resetOnSuccess?: boolean; testId?: string;
}) {
  const reval = Array.isArray(revalidate) ? revalidate : revalidate ? [revalidate] : [];
  return (
    <ActionForm action={runRpc} errors={t.errors} success={success ?? t.common.saved} className={className} resetOnSuccess={resetOnSuccess} testId={testId}>
      <input type="hidden" name="_rpc" value={rpc} />
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v ?? ''} />)}
      {reval.map((r) => <input key={r} type="hidden" name="_revalidate" value={r} />)}
      {redirect ? <input type="hidden" name="_redirect" value={redirect} /> : null}
      {children}
    </ActionForm>
  );
}

/** Approve / reject pair for any review_* RPC. */
export function ReviewButtons({ rpc, id, t, revalidate, withNote = false, testId }: { rpc: string; id: string; t: Dict; revalidate: string; withNote?: boolean; testId?: string }) {
  return (
    <RpcForm rpc={rpc} t={t} hidden={{ p_id: id }} revalidate={revalidate} className="flex flex-col items-end gap-2" testId={testId}>
      {withNote ? <input name="p_note" className="input h-8 max-w-56 text-xs" placeholder={t.common.notes} /> : null}
      <div className="flex gap-1.5">
        <SubmitButton size="sm" variant="secondary" name="p_approve" value="false" testId={testId ? `${testId}-reject` : undefined}>{t.common.reject}</SubmitButton>
        <SubmitButton size="sm" name="p_approve" value="true" testId={testId ? `${testId}-approve` : undefined}>{t.common.approve}</SubmitButton>
      </div>
    </RpcForm>
  );
}
