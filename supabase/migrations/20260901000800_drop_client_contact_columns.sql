-- Every reader moved to client_contacts in 20260901000700 and the tasks that
-- followed it. The columns are now write-only dead weight, and leaving them is
-- an invitation for a future query to join the wrong source of truth.
--
-- CONTRACT HALF OF AN EXPAND/CONTRACT PAIR. 20260901000700 is additive and
-- backward-compatible: it can be applied while the previous build (which still
-- reads/writes clients.contact_name/contact_email) is serving traffic. This
-- migration is not — it drops columns the previous build selects by name, so
-- applying it before the build that reads client_contacts is live will 500
-- every project page, invoice detail and PDF download with SQLSTATE 42703
-- until the new build finishes deploying.
--
-- On an update (not a first deploy), apply 20260901000700 alone, deploy the
-- new build, confirm it is live, and only then apply this file. See
-- docs/DEPLOYMENT.md §2 for the current worked example of this ordering.
alter table clients
  drop column contact_name,
  drop column contact_email;
