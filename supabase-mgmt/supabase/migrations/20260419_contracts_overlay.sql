-- ============================================================================
-- Contracts overlay — extend orderforms with user-maintained fields
-- ============================================================================
-- QBO Estimates are the authoritative contract base (customer, line items,
-- totals). The orderforms table overlays them with:
--   * end_date — when recognition should stop (QBO Estimate has no such field)
--   * auto_renewal — flag indicating the contract auto-renews on end_date
--
-- Keyed by orderform_code, which matches qbo_estimates.doc_number.
-- ============================================================================

alter table public.orderforms
  add column if not exists end_date date,
  add column if not exists auto_renewal boolean not null default false;

comment on column public.orderforms.end_date is 'Last month of recognition for this contract. User-entered; overrides term_months when both present.';
comment on column public.orderforms.auto_renewal is 'If true, contract is expected to renew at end_date — recognition continues on a new orderform from (end_date + 1 day).';
