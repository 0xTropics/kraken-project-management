-- Client feature requests, submitted from the portal and triaged in Kraken.
-- Spec: docs/superpowers/specs/2026-10-04-client-feature-requests-design.md
--
-- The first client-written table. A request is not work until the operator
-- accepts it, which creates a linked backlog item; the client-facing status is
-- derived from this row and that item, never stored.

create type client_request_status as enum ('submitted','accepted','declined');

create table client_requests (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  title           text not null check (length(btrim(title)) between 1 and 200),
  body            text not null check (length(btrim(body)) between 1 and 5000),
  requester_name  text not null check (length(btrim(requester_name)) between 1 and 100),
  status          client_request_status not null default 'submitted',
  decline_note    text check (decline_note is null or length(decline_note) <= 1000),
  -- Deleting the item leaves the request accepted with no link; the portal
  -- reads that as "Not planned".
  work_item_id    uuid unique references work_items(id) on delete set null,
  decided_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check ((status = 'submitted') = (decided_at is null)),
  check (status = 'declined' or decline_note is null)
);
create index client_requests_project_created_idx on client_requests(project_id, created_at desc);
create index client_requests_submitted_idx on client_requests(project_id) where status = 'submitted';
create trigger client_requests_updated_at before update on client_requests
  for each row execute function set_updated_at();

create table client_request_images (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null references client_requests(id) on delete cascade,
  storage_path  text not null unique,
  content_type  text not null check (content_type in ('image/png','image/jpeg','image/webp','image/gif')),
  byte_size     integer not null check (byte_size between 1 and 1572864),
  created_at    timestamptz not null default now()
);
create index client_request_images_request_idx on client_request_images(request_id);

-- Same lockdown as every other table: RLS on, no policies, nothing granted to
-- public. Server code connects as the owner and is unaffected.
alter table client_requests enable row level security;
revoke all on table client_requests from public;
alter table client_request_images enable row level security;
revoke all on table client_request_images from public;
