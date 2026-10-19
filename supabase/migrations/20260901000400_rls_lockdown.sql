-- Kraken has exactly three server-side auth contexts (internal session, agent
-- bearer token, portal cookie) and no browser ever holds a Supabase key with
-- table access. Row Level Security is therefore switched on with no permissive
-- policies at all: any anon/authenticated PostgREST request reads and writes
-- nothing. Server code connects over the pooled service connection, which is a
-- BYPASSRLS role (service_role) or the table owner, so it is unaffected.
--
-- RLS is enabled but NOT forced: forcing it would also lock out the owning role
-- the server connects as, and there is no per-user identity to write policies
-- against anyway. Per PRD D11 the portal's isolation lives in the portal data
-- module, not in a policy. Locking the tables shut means a leaked anon key is
-- inert rather than merely inconvenient.

do $$
declare t text;
begin
  foreach t in array array[
    'clients','projects','milestones','work_items','progress_notes','project_notes',
    'time_entries','invoices','invoice_lines','invoice_counters','agent_tokens',
    'audit_log','portal_login_attempts','internal_users'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on table %I from public', t);
  end loop;
end $$;
