-- Kraken core schema: clients, projects, milestones, work items, notes, time entries.
-- Every table: uuid pk, created_at, updated_at. Soft delete via archived_at where noted.

create type project_status     as enum ('active','paused','completed','archived');
create type billing_model      as enum ('hourly','retainer');
create type currency_code      as enum ('USD','CAD');
create type milestone_status   as enum ('open','done');
create type work_item_type     as enum ('feature','bug','chore');
create type work_item_status   as enum ('backlog','planned','in_progress','ready_for_review','done','wont_do');
create type work_item_priority as enum ('low','medium','high');
create type content_source     as enum ('user','agent');

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table clients (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(btrim(name)) > 0),
  contact_name  text,
  contact_email text,
  notes         text,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger clients_updated_at before update on clients
  for each row execute function set_updated_at();

create table projects (
  id                      uuid primary key default gen_random_uuid(),
  client_id               uuid not null references clients(id) on delete restrict,
  name                    text not null check (length(btrim(name)) > 0),
  slug                    text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description             text,
  status                  project_status not null default 'active',
  billing_model           billing_model not null,
  currency                currency_code not null default 'USD',
  hourly_rate             numeric(10,2),
  retainer_amount         numeric(10,2),
  tax_rate                numeric(6,4) not null default 0 check (tax_rate >= 0 and tax_rate <= 1),
  -- Portal auth. Hash is argon2id. Version increments on rotation and invalidates live cookies.
  portal_password_hash    text not null,
  portal_password_version integer not null default 1,
  -- Open question 1 resolved: payment instructions are per project.
  payment_instructions    text,
  -- Open question 2 resolved: retainer invoices omit an hours line unless toggled per project.
  retainer_show_hours     boolean not null default false,
  repo_url                text,
  started_at              date,
  archived_at             timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint projects_hourly_needs_rate
    check (billing_model <> 'hourly' or hourly_rate is not null),
  constraint projects_retainer_needs_amount
    check (billing_model <> 'retainer' or retainer_amount is not null)
);
create index projects_client_id_idx on projects(client_id);
create index projects_status_idx on projects(status) where archived_at is null;
create trigger projects_updated_at before update on projects
  for each row execute function set_updated_at();

create table milestones (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects(id) on delete cascade,
  name           text not null check (length(btrim(name)) > 0),
  target_date    date,
  status         milestone_status not null default 'open',
  client_visible boolean not null default true,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index milestones_project_id_idx on milestones(project_id);
create trigger milestones_updated_at before update on milestones
  for each row execute function set_updated_at();

create table work_items (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects(id) on delete cascade,
  milestone_id   uuid references milestones(id) on delete set null,
  type           work_item_type not null,
  status         work_item_status not null default 'backlog',
  priority       work_item_priority not null default 'medium',
  title          text not null check (length(btrim(title)) > 0),
  description    text,
  client_visible boolean not null default false,
  source         content_source not null default 'user',
  sort_order     integer not null default 0,
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index work_items_project_status_idx on work_items(project_id, status);
create index work_items_milestone_idx on work_items(milestone_id);
create trigger work_items_updated_at before update on work_items
  for each row execute function set_updated_at();

-- completed_at is derived from status and never trusted from the caller.
create or replace function work_items_sync_completed_at() returns trigger
language plpgsql as $$
begin
  if new.status = 'done' then
    if tg_op = 'INSERT' or old.status is distinct from 'done' then
      new.completed_at := now();
    end if;
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;
create trigger work_items_completed_at before insert or update on work_items
  for each row execute function work_items_sync_completed_at();

-- Defense in depth for PRD D5. The API layer is the primary guard; this trigger makes
-- `done` unreachable even if a future code path forgets, because the agent request
-- context sets kraken.actor_type='agent' for the life of its transaction.
create or replace function work_items_guard_agent_done() returns trigger
language plpgsql as $$
begin
  if new.status = 'done' and coalesce(current_setting('kraken.actor_type', true), 'user') = 'agent' then
    raise exception 'agent_cannot_set_done'
      using errcode = 'check_violation',
            hint = 'ready_for_review is the highest status the agent may set';
  end if;
  return new;
end;
$$;
create trigger work_items_agent_done_guard before insert or update on work_items
  for each row execute function work_items_guard_agent_done();

create table progress_notes (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  work_item_id uuid references work_items(id) on delete set null,
  body         text not null check (length(btrim(body)) > 0),
  source       content_source not null default 'user',
  approved_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index progress_notes_project_created_idx on progress_notes(project_id, created_at desc);
create index progress_notes_pending_idx on progress_notes(project_id) where approved_at is null;
create trigger progress_notes_updated_at before update on progress_notes
  for each row execute function set_updated_at();

create table project_notes (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects(id) on delete cascade,
  title          text not null check (length(btrim(title)) > 0),
  body           text not null default '',
  agent_readable boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index project_notes_project_idx on project_notes(project_id);
create trigger project_notes_updated_at before update on project_notes
  for each row execute function set_updated_at();

create table time_entries (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  work_item_id    uuid references work_items(id) on delete set null,
  date            date not null,
  hours_worked    numeric(5,2) not null check (hours_worked > 0 and hours_worked <= 24),
  hours_billed    numeric(5,2) not null check (hours_billed >= 0 and hours_billed <= 24),
  discount_reason text,
  rate_override   numeric(10,2) check (rate_override is null or rate_override >= 0),
  description     text,
  invoice_id      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint time_entries_billed_lte_worked check (hours_billed <= hours_worked)
);
create index time_entries_project_date_idx on time_entries(project_id, date desc);
create index time_entries_unbilled_idx on time_entries(project_id, date) where invoice_id is null;
create trigger time_entries_updated_at before update on time_entries
  for each row execute function set_updated_at();
