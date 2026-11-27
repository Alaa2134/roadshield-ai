-- Fix #12: serialize invoice approvals per contract.
-- review_invoice previously locked only the invoice row, so two different invoices of the same contract
-- approved concurrently could both pass the EXCEEDS_COMMITMENT check. We now lock the parent contract
-- row first, then the invoice, and only then read the commitment and approved-invoice sum.
-- Under READ COMMITTED each statement takes a fresh snapshot, so reads issued after the lock is
-- acquired see invoices approved by a transaction that held the lock before us.
-- Lock order is always contract -> invoice (record_payment locks only the invoice), so no cycles.
-- Signature, security definer, search_path = '' and grants are unchanged (create or replace keeps ACLs).

create or replace function public.review_invoice(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_i public.invoices; v_contract uuid; v_commit numeric; v_invoiced numeric;
begin
  -- Unlocked peek only to learn the parent contract; authoritative state is re-read under lock below.
  select contract_id into v_contract from public.invoices where id = p_id;
  if v_contract is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  perform 1 from public.contracts where id = v_contract for update;
  select * into v_i from public.invoices where id = p_id for update;
  if v_i.id is null or v_i.contract_id is distinct from v_contract then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  perform app_private.require_org_role(v_i.org_id, array['owner','finance_manager']::public.org_role[]);
  if v_i.status <> 'submitted' then raise exception 'INVALID_TRANSITION' using errcode = 'P0001'; end if;
  perform app_private.assert_four_eyes(v_i.org_id, v_i.submitted_by);
  if p_approve then
    -- Net invoiced value may not exceed the contract commitment (incl. approved change orders).
    select c.amount + coalesce((select sum(x.amount) from public.change_orders x
                                where x.contract_id = c.id and x.status = 'approved'), 0)
      into v_commit from public.contracts c where c.id = v_i.contract_id;
    select coalesce(sum(net_amount), 0) into v_invoiced from public.invoices
    where contract_id = v_i.contract_id and status = 'approved';
    if v_invoiced + v_i.net_amount > v_commit then
      raise exception 'EXCEEDS_COMMITMENT' using errcode = 'P0001';
    end if;
  end if;
  update public.invoices set status = case when p_approve then 'approved' else 'rejected' end::public.approval_status,
    reviewed_by = auth.uid(), reviewed_at = now(), review_note = left(p_note, 1000)
  where id = p_id;
  perform app_private.audit_org(v_i.org_id, case when p_approve then 'invoice.approve' else 'invoice.reject' end,
    'invoice', p_id::text, jsonb_build_object('total', v_i.total_amount, 'note', p_note));
end;
$$;
