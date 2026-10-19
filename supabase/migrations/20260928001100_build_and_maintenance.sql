-- Build + maintenance: a third billing model for web clients. A tracked build
-- fee billed in installments (charges of kind 'build'), and a flat maintenance
-- fee billed monthly or prepaid for 6 or 12 months at a per-project price.
-- Spec: docs/superpowers/specs/2026-09-28-build-and-maintenance-design.md
--
-- Enum values are added but never used in this file. ALTER TYPE ... ADD VALUE
-- is allowed inside a transaction (PG12+), but a value added in a transaction
-- cannot be used until it commits, and scripts/migrate.ts runs each file in
-- one. Every constraint below is therefore written against values that
-- already existed.
--
-- No new columns on invoices: a maintenance invoice's covered term is its own
-- period_start/period_end, already frozen by invoices_guard_immutable().

alter type billing_model     add value 'maintenance';
alter type invoice_line_kind add value 'maintenance';
alter type invoice_line_kind add value 'build';
alter type charge_kind       add value 'build';

alter table projects
  add column build_fee               numeric(10,2) check (build_fee > 0),
  add column maintenance_monthly     numeric(10,2) check (maintenance_monthly > 0),
  add column maintenance_price_6     numeric(10,2),
  add column maintenance_price_12    numeric(10,2),
  add column maintenance_term_months smallint not null default 1
    check (maintenance_term_months in (1, 6, 12)),
  add column maintenance_starts_on   date
    check (extract(day from maintenance_starts_on) = 1),
  add constraint projects_maintenance_needs_monthly
    check (billing_model in ('hourly', 'retainer') or maintenance_monthly is not null),
  -- A prepay price is for the whole term, and is never more than paying monthly.
  add constraint projects_maintenance_price_6_range
    check (maintenance_price_6 is null
           or (maintenance_monthly is not null
               and maintenance_price_6 > 0
               and maintenance_price_6 <= 6 * maintenance_monthly)),
  add constraint projects_maintenance_price_12_range
    check (maintenance_price_12 is null
           or (maintenance_monthly is not null
               and maintenance_price_12 > 0
               and maintenance_price_12 <= 12 * maintenance_monthly));
