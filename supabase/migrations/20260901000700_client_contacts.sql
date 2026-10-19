-- A client has any number of contacts and at most one primary. The partial
-- unique index is the entire rule: two primaries is not a race the application
-- has to avoid, it is a state the database will not hold. Zero primaries is
-- legal and means an invoice bills to the company name alone, which is exactly
-- what a null contact_name does today.
create table client_contacts (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references clients(id) on delete cascade,
  name       text not null check (length(btrim(name)) > 0),
  email      text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index client_contacts_client_idx on client_contacts(client_id, created_at);
create unique index client_contacts_one_primary
  on client_contacts(client_id) where is_primary;
create trigger client_contacts_updated_at before update on client_contacts
  for each row execute function set_updated_at();

-- Same lockdown as every other table: RLS on, no policies, nothing granted to
-- public. Server code connects as the owner and is unaffected.
alter table client_contacts enable row level security;
revoke all on table client_contacts from public;

-- Lift each client's existing contact into a primary row. A client may hold an
-- email with no name, and name is not null, hence the coalesce chain.
insert into client_contacts (client_id, name, email, is_primary)
select id,
       coalesce(nullif(btrim(contact_name), ''), nullif(btrim(contact_email), ''), 'Contact'),
       nullif(btrim(contact_email), ''),
       true
from clients
where contact_name is not null or contact_email is not null;

-- The invoice keeps its own copy of who it was billed to. Without this the
-- screen joins to clients at read time while the stored PDF never re-renders,
-- so editing a contact makes the two disagree about an invoice already sent.
alter table invoices
  add column bill_to_name          text,
  add column bill_to_contact_name  text,
  add column bill_to_contact_email text;

-- Backfill from current client data. The original is unrecoverable; this is
-- the best available answer and is exact for any invoice whose client has not
-- been edited since.
update invoices i
set bill_to_name          = c.name,
    bill_to_contact_name  = c.contact_name,
    bill_to_contact_email = c.contact_email
from projects p
join clients c on c.id = p.client_id
where p.id = i.project_id and i.status <> 'draft';

-- ORDER MATTERS: the guard is an explicit column allow-list, so the backfill
-- above passes only while the new columns are absent from it. Extending the
-- guard first would make this migration fail on its own backfill.
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
  or new.bill_to_contact_email is distinct from old.bill_to_contact_email then
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
