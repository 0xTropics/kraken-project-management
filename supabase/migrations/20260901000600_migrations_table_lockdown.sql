-- kraken_migrations is created by the migration runner itself (scripts/migrate.ts),
-- not by a migration file, so the sweep in 20260901000400_rls_lockdown.sql never
-- reaches it: that file enumerates the fourteen application tables and this one
-- did not exist as a concept there.
--
-- The consequence is small but real. In a default Supabase project the anon and
-- authenticated roles hold table privileges in the public schema, and the anon
-- key ships to every browser by design. A table left without RLS is therefore
-- readable -- and writable -- through PostgREST by anyone holding it. There is no
-- client data here, only migration filenames and checksums, but a forged or
-- deleted row is enough to make the next deploy's migration run refuse to
-- proceed. The stated guarantee is that a leaked anon key reads nothing; this
-- closes the one table that did not honour it.
--
-- As elsewhere: enabled, not forced, so the owning role the runner connects as
-- is unaffected and can still record its own applied migrations.
alter table kraken_migrations enable row level security;
revoke all on table kraken_migrations from public;
