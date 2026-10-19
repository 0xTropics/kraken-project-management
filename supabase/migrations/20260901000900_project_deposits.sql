-- Money a client pays before the work it covers is invoiced. A deposit is a
-- payment against the total, not a discount on the work: computeTotals sums
-- every invoice line into subtotal and taxes that, so representing a deposit as
-- a line would reduce the taxable base and under-collect tax. It therefore
-- lives on the invoice as its own column, applied after tax.
create table project_deposits (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  amount      numeric(12,2) not null check (amount > 0),
  received_on date not null,
  method      payment_method not null,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index project_deposits_project_idx on project_deposits(project_id, received_on desc);
create trigger project_deposits_updated_at before update on project_deposits
  for each row execute function set_updated_at();

-- Same lockdown as every other table: RLS on, no policies, nothing granted to
-- public. Server code connects as the owner and is unaffected.
alter table project_deposits enable row level security;
revoke all on table project_deposits from public;

-- Defaults to 0, so every existing invoice is already correct and no backfill
-- is needed. The remaining balance is never stored -- it is always the recorded
-- deposits minus what non-voided invoices drew down.
alter table invoices
  add column deposit_applied numeric(12,2) not null default 0
    check (deposit_applied >= 0);

-- The guard is an explicit column allow-list. This body is the CURRENT one from
-- 20260901000700 (which itself carried forward the pdf_path write-once rule
-- added by 20260901000500), plus deposit_applied. Copy the current body when
-- extending this function; a replacement written from an older version silently
-- reverts whatever was added in between, which has happened here before.
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
  or new.created_at   is distinct from old.created_at
  or new.bill_to_name          is distinct from old.bill_to_name
  or new.bill_to_contact_name  is distinct from old.bill_to_contact_name
  or new.bill_to_contact_email is distinct from old.bill_to_contact_email
  or new.deposit_applied       is distinct from old.deposit_applied then
    raise exception 'invoice_immutable'
      using errcode = 'check_violation',
            hint = 'finalized invoices cannot be edited; void and reissue instead';
  end if;
  if old.status = 'void' and new.status <> 'void' then
    raise exception 'invoice_void_is_terminal' using errcode = 'check_violation';
  end if;
  if new.status = 'draft' then
    raise exception 'invoice_cannot_return_to_draft' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
