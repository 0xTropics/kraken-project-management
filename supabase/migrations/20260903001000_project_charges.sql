-- Charges: money owed that did not come from the clock. Three kinds today --
-- a pass-through cost paid on the client's behalf, a fixed-price item, and a
-- commission on a third party's transaction. Recorded when incurred, swept
-- onto the next draft invoice regardless of period, because a charge is a
-- discrete event rather than time-bucketed hours: a period-scoped sweep would
-- strand any charge dated outside the period being invoiced.
--
-- Unlike time_entries, a charge carries no invoice_id. Its billed state is
-- derived from invoice_lines.charge_id joined to a non-void invoice, so
-- voiding an invoice and deleting a draft both release charges with no release
-- code to forget -- the same shape that makes deposits safe to void.
create type charge_kind as enum ('expense', 'fixed', 'commission');

create table project_charges (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  kind        charge_kind not null,
  description text not null,
  amount      numeric(12,2) not null check (amount > 0),
  taxable     boolean not null default true,
  incurred_on date not null,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index project_charges_project_idx on project_charges(project_id, incurred_on desc);
create trigger project_charges_updated_at before update on project_charges
  for each row execute function set_updated_at();

-- Same lockdown as every other table: RLS on, no policies, nothing granted to
-- public. Server code connects as the owner and is unaffected.
alter table project_charges enable row level security;
revoke all on table project_charges from public;

-- taxable defaults true, so every existing line keeps today's behaviour and no
-- backfill is needed. A non-taxable line joins the subtotal but not the taxable
-- base: a pass-through cost may already have carried its tax, and taxing it
-- again over-collects on money that was never marked up.
--
-- charge_id is null for hand-typed lines; when set it is both the provenance
-- link and the double-bill lock. on delete restrict means a charge sitting on
-- any invoice cannot be deleted -- remove its line first, which unbills it.
alter table invoice_lines
  add column charge_id uuid references project_charges(id) on delete restrict,
  add column taxable   boolean not null default true;
create index invoice_lines_charge_idx on invoice_lines(charge_id) where charge_id is not null;

-- A unique index would be wrong: void-and-reissue legitimately produces a
-- second line for the same charge. The real constraint is "at most one line on
-- a NON-VOID invoice", which has to see invoices.status.
--
-- Not concurrency-safe on its own -- two simultaneous inserts could both pass
-- the exists check. createDraftInvoice and the re-sweep route both hold
-- `for update` on the project row, which serialises them. This catches a logic
-- error, not a race.
create or replace function invoice_lines_guard_charge_once() returns trigger
language plpgsql as $$
begin
  if new.charge_id is null then
    return new;
  end if;
  if exists (
    select 1
      from invoice_lines l
      join invoices i on i.id = l.invoice_id
     where l.charge_id = new.charge_id
       and l.id <> new.id
       and i.status <> 'void'
  ) then
    raise exception 'charge_already_billed'
      using errcode = 'check_violation',
            hint = 'this charge is already on a live invoice; void that invoice to rebill it';
  end if;
  return new;
end;
$$;

create trigger invoice_lines_charge_once
  before insert or update on invoice_lines
  for each row execute function invoice_lines_guard_charge_once();

-- NOTE for whoever extends invoices_guard_immutable() next: that function is a
-- DENY-list, not the allow-list the 20260901000900 comment calls it. It
-- enumerates frozen columns and permits anything unnamed, so a new column on
-- invoices is MUTABLE after finalization until it is added there. This
-- migration adds no column to invoices and so does not touch it.
