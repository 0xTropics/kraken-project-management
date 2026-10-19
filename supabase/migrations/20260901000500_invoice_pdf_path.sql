-- Let a finalized invoice record where its PDF landed, exactly once.
--
-- 20260901000200 froze every column on a finalized invoice, `pdf_path`
-- included. But the document is rendered *after* the finalize transaction
-- commits -- a storage write must not be held inside a database transaction,
-- and a storage failure must not roll back a correctly-numbered invoice -- so
-- `attachPdfPath` always ran against a row the guard had already sealed. The
-- result was that finalize silently swallowed the render (it is wrapped in a
-- try/catch) and every later download raised `invoice_immutable`, taking out
-- both the internal PDF route and the portal's signed download.
--
-- The fix is the narrowest one that matches what the engine already documents:
-- `pdf_path` may go from NULL to a value, and never change again. Swapping the
-- document under a number that has gone out stays impossible.
create or replace function invoices_guard_immutable() returns trigger
language plpgsql as $$
begin
  if old.status = 'draft' then
    return new;
  end if;
  if new.project_id   is distinct from old.project_id
  or new.number       is distinct from old.number
  or new.period_start is distinct from old.period_start
  or new.period_end   is distinct from old.period_end
  or new.currency     is distinct from old.currency
  or new.tax_rate     is distinct from old.tax_rate
  or new.subtotal     is distinct from old.subtotal
  or new.tax_amount   is distinct from old.tax_amount
  or new.total        is distinct from old.total
  or new.notes        is distinct from old.notes
  or new.payment_instructions is distinct from old.payment_instructions
  -- Write-once: null -> path is allowed, path -> anything else is not.
  or (new.pdf_path is distinct from old.pdf_path and old.pdf_path is not null)
  or new.finalized_at is distinct from old.finalized_at
  or new.created_at   is distinct from old.created_at then
    raise exception 'invoice_immutable'
      using errcode = 'check_violation',
            hint = 'finalized invoices cannot be edited; void and reissue instead';
  end if;
  -- Voided is terminal, and nothing may walk backwards to draft.
  if old.status = 'void' and new.status <> 'void' then
    raise exception 'invoice_void_is_terminal' using errcode = 'check_violation';
  end if;
  if new.status = 'draft' then
    raise exception 'invoice_cannot_return_to_draft' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
