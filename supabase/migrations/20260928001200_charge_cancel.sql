-- A charge whose only invoice lines sit on voided invoices cannot be deleted
-- (invoice_lines.charge_id is `on delete restrict`, and a void invoice's lines
-- are frozen), so until now it re-swept onto every later draft forever -- and a
-- mistyped `build` installment also held the build-fee cap. Cancelling marks
-- it done without touching the voided invoice's frozen line.
-- Spec: docs/superpowers/specs/2026-09-28-build-and-maintenance-design.md
alter table project_charges add column cancelled_at timestamptz;
