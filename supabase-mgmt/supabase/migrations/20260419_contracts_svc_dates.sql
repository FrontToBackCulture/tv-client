-- ============================================================================
-- Contracts overlay — add separate SVC recognition period
-- ============================================================================
-- Setup fees / professional services are often recognised over a different
-- window than the subscription (e.g. setup over 3 months while subscription
-- runs 12). These columns store the SVC recognition period independently.
-- Empty → treat as equal to the SUB start/end dates.
-- ============================================================================

alter table public.orderforms
  add column if not exists svc_start_date date,
  add column if not exists svc_end_date date;

comment on column public.orderforms.svc_start_date is 'Service/fee recognition start (overrides start_date). Defaults to start_date when null.';
comment on column public.orderforms.svc_end_date is 'Service/fee recognition end (overrides end_date). Defaults to end_date when null.';
