-- Retire the coding-agent integration: the MCP endpoint, agent tokens, the
-- ready_for_review status, and the source / agent_readable markers.
-- Spec: docs/superpowers/specs/2026-10-04-retire-agent-integration-design.md
--
-- audit_log.actor_type keeps its 'agent' value: past MCP calls are history.

-- 1. Nothing becomes Done without the operator deciding. Idempotent: the owner
--    may already have run this by hand before the deploy.
update work_items set status = 'in_progress' where status = 'ready_for_review';

-- 2. Rebuild the status enum without the review value. Postgres cannot drop
--    an enum value, so swap the type. The default must come off first: it is
--    typed as the old enum and cannot be cast in place.
alter type work_item_status rename to work_item_status_old;
create type work_item_status as enum ('backlog','planned','in_progress','done','wont_do');
alter table work_items alter column status drop default;
alter table work_items
  alter column status type work_item_status using status::text::work_item_status;
alter table work_items alter column status set default 'backlog';
drop type work_item_status_old;

-- 2b. Every live session that already fired this trigger cached a plan naming
--     the old type, and keeps failing with "cache lookup failed for type" on
--     any work_items write until its connection closes. Re-creating the
--     function (body unchanged from core.sql) forces every session to replan.
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

-- 3. The agent could never set done; there is no agent.
drop trigger if exists work_items_agent_done_guard on work_items;
drop function if exists work_items_guard_agent_done();

-- 4. Agent markers.
alter table work_items drop column source;
alter table progress_notes drop column source;
drop type content_source;
alter table project_notes drop column agent_readable;

-- 5. Agent credentials.
drop table agent_tokens;
