-- Invoicing. Finalized invoices are immutable; corrections are void-and-reissue.

create type invoice_status     as enum ('draft','sent','paid','void');
create type invoice_line_kind  as enum ('time','retainer','adhoc','discount');
create type payment_method     as enum ('cash','crypto','etransfer');

-- Per-year counter. `YYYY-NNN`, sequential per year, never handed to two invoices.
create table invoice_counters (
  year        integer primary key,
  last_number integer not null default 0
);

create table invoices (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects(id) on delete restrict,
  number         text unique,
  status         invoice_status not null default 'draft',
  period_start   date not null,
  period_end     date not null,
  currency       currency_code not null,
  tax_rate       numeric(6,4) not null default 0,
  subtotal       numeric(12,2) not null default 0,
  tax_amount     numeric(12,2) not null default 0,
  total          numeric(12,2) not null default 0,
  notes          text,
  payment_instructions text,
  payment_method payment_method,
  payment_note   text,
  published_at   timestamptz,
  finalized_at   timestamptz,
  sent_at        timestamptz,
  paid_at        timestamptz,
  voided_at      timestamptz,
  pdf_path       text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint invoices_period_order check (period_end >= period_start),
  -- A draft has no number; anything past draft must have one.
  constraint invoices_number_presence check ((status = 'draft') = (number is null)),
  constraint invoices_paid_needs_method check (status <> 'paid' or payment_method is not null)
);
create index invoices_project_idx on invoices(project_id, period_start desc);
create index invoices_published_idx on invoices(project_id) where published_at is not null;
create trigger invoices_updated_at before update on invoices
  for each row execute function set_updated_at();

create table invoice_lines (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references invoices(id) on delete cascade,
  kind        invoice_line_kind not null,
  description text not null,
  quantity    numeric(10,2) not null default 1,
  unit_amount numeric(12,2) not null,
  amount      numeric(12,2) not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index invoice_lines_invoice_idx on invoice_lines(invoice_id, sort_order);
create trigger invoice_lines_updated_at before update on invoice_lines
  for each row execute function set_updated_at();

alter table time_entries
  add constraint time_entries_invoice_fk
  foreign key (invoice_id) references invoices(id) on delete restrict;

-- ---------------------------------------------------------------------------
-- Immutability
-- ---------------------------------------------------------------------------
-- Escape hatch used by exactly one code path (void), which sets the GUC to the
-- invoice id it is voiding for the life of that transaction.
create or replace function kraken_unlocking_invoice(inv uuid) returns boolean
language sql stable as $$
  select coalesce(current_setting('kraken.unlock_invoice', true), '') = inv::text;
$$;

-- Finalized invoices freeze their money and identity columns. Lifecycle columns
-- (status, payment, publication) stay writable so sent -> paid -> void still works.
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
  or new.pdf_path     is distinct from old.pdf_path
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
create trigger invoices_immutable before update on invoices
  for each row execute function invoices_guard_immutable();

create or replace function invoices_guard_delete() returns trigger
language plpgsql as $$
begin
  if old.status <> 'draft' then
    raise exception 'invoice_immutable'
      using errcode = 'check_violation',
            hint = 'only draft invoices may be deleted';
  end if;
  return old;
end;
$$;
create trigger invoices_delete_guard before delete on invoices
  for each row execute function invoices_guard_delete();

-- Lines may only move while the parent invoice is a draft.
create or replace function invoice_lines_guard_parent_draft() returns trigger
language plpgsql as $$
declare
  parent_id uuid := coalesce(new.invoice_id, old.invoice_id);
  parent_status invoice_status;
begin
  select status into parent_status from invoices where id = parent_id;
  if parent_status is null then
    return coalesce(new, old);
  end if;
  if parent_status <> 'draft' then
    raise exception 'invoice_immutable'
      using errcode = 'check_violation',
            hint = 'lines of a finalized invoice cannot be added, changed, or removed';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger invoice_lines_parent_draft before insert or update or delete on invoice_lines
  for each row execute function invoice_lines_guard_parent_draft();

-- A time entry attached to a finalized invoice is frozen. Voiding that invoice
-- releases its entries so the work can be reissued.
create or replace function time_entries_guard_locked() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.invoice_id is not null and not kraken_unlocking_invoice(old.invoice_id) then
      raise exception 'time_entry_locked'
        using errcode = 'check_violation',
              hint = 'entries on a finalized invoice are read-only';
    end if;
    return old;
  end if;
  if old.invoice_id is not null and not kraken_unlocking_invoice(old.invoice_id) then
    raise exception 'time_entry_locked'
      using errcode = 'check_violation',
            hint = 'entries on a finalized invoice are read-only';
  end if;
  return new;
end;
$$;
create trigger time_entries_locked before update or delete on time_entries
  for each row execute function time_entries_guard_locked();
