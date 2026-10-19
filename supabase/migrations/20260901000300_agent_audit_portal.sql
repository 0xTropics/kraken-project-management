-- Agent tokens, append-only audit log, portal login attempts, internal users.

create type actor_type as enum ('user','agent','portal');

create table agent_tokens (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(btrim(name)) > 0),
  -- SHA-256 hex of the raw token. The raw value is shown once, at creation.
  token_hash   text not null unique,
  last_used_at timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index agent_tokens_active_idx on agent_tokens(token_hash) where revoked_at is null;
create trigger agent_tokens_updated_at before update on agent_tokens
  for each row execute function set_updated_at();

-- Append-only. Enforced by trigger, not only by grants, so it holds for the
-- owning role the application actually connects as.
create table audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_type  actor_type not null,
  actor_id    uuid,
  actor_label text,
  project_id  uuid references projects(id) on delete set null,
  action      text not null,
  entity_type text,
  entity_id   uuid,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_created_idx on audit_log(created_at desc);
create index audit_log_project_idx on audit_log(project_id, created_at desc);
create index audit_log_actor_idx on audit_log(actor_type, actor_id, created_at desc);
create index audit_log_action_idx on audit_log(action);

create or replace function audit_log_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_log_is_append_only'
    using errcode = 'insufficient_privilege',
          hint = 'the audit log accepts inserts only';
end;
$$;
create trigger audit_log_no_update before update on audit_log
  for each row execute function audit_log_append_only();
create trigger audit_log_no_delete before delete on audit_log
  for each row execute function audit_log_append_only();
-- Belt and braces: also remove the grants, so a dropped trigger is not the only guard.
revoke update, delete, truncate on audit_log from public;

create table portal_login_attempts (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  slug       text,
  ip         inet,
  user_agent text,
  success    boolean not null,
  created_at timestamptz not null default now()
);
create index portal_login_attempts_project_idx on portal_login_attempts(project_id, created_at desc);

-- Internal operator accounts. Used by the credential-free local auth mode; in
-- Supabase mode the identity comes from Supabase Auth and this row mirrors it so
-- audit rows and the allow-list have a stable local id.
create table internal_users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  name          text,
  password_hash text,
  supabase_uid  uuid unique,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger internal_users_updated_at before update on internal_users
  for each row execute function set_updated_at();
