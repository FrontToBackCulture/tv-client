-- ============================================================================
-- Invoice line recognition — overlay on qbo_invoices.line_items
-- ============================================================================
-- Each row annotates ONE line of ONE QBO invoice with how/when its revenue
-- should be recognised. Driven by the accounting reality that invoices —
-- not contracts — create deferred revenue.
--
--   QBO Invoice posts:  DR AR / CR Deferred Revenue (full line amount)
--   Each month posts:   DR Deferred Revenue / CR Revenue (recognised slice)
--
-- An invoice can have a recognition window that spans before AND after the
-- invoice date (back-billing, forward-billing). A single invoice can mix
-- subscription (SUB) + services (SVC) lines, each with its own window.
--
-- Source of truth for line data stays in qbo_invoices.line_items (jsonb).
-- This table holds annotation only, keyed by (qbo_invoice_id, qbo_line_id).
-- ============================================================================

create table public.invoice_line_recognition (
  qbo_invoice_id  text not null references public.qbo_invoices(qbo_id) on delete cascade,
  qbo_line_id     text not null,                                       -- QBO Line.Id (stable within invoice)

  -- Classification (auto-suggested from item_ref prefix, user-overridable)
  line_type       text not null check (line_type in ('SUB','SVC','OTHER')),

  -- Recognition window — may straddle invoice txn_date in either direction.
  -- Null until annotated; UI surfaces unannotated lines as a work queue.
  recog_start     date,
  recog_end       date,
  recog_method    text not null default 'straight_line'
                       check (recog_method in ('straight_line','on_receipt','milestone')),

  -- Optional link back to a contract (orderforms.orderform_code) for drift
  -- checks: did we invoice what we signed for? Soft reference, no FK.
  contract_code   text,

  notes           text,

  annotated_by    uuid,
  annotated_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  primary key (qbo_invoice_id, qbo_line_id),

  -- Recognition window must be coherent if both set
  constraint ilr_window_ordered check (
    recog_start is null or recog_end is null or recog_end >= recog_start
  )
);

create index idx_ilr_recog_window on public.invoice_line_recognition (recog_start, recog_end)
  where recog_start is not null;
create index idx_ilr_contract     on public.invoice_line_recognition (contract_code)
  where contract_code is not null;
create index idx_ilr_line_type    on public.invoice_line_recognition (line_type);

create trigger ilr_updated_at
  before update on public.invoice_line_recognition
  for each row execute function public.update_updated_at();

alter table public.invoice_line_recognition enable row level security;
create policy "ilr_all" on public.invoice_line_recognition for all using (true) with check (true);

comment on table public.invoice_line_recognition is
  'Per-invoice-line revenue recognition annotation. Drives the deferred-revenue rollforward.';
comment on column public.invoice_line_recognition.qbo_line_id is
  'QBO Line.Id from qbo_invoices.line_items[].Id — stable within an invoice.';
comment on column public.invoice_line_recognition.line_type is
  'SUB = subscription (Software:*), SVC = services (Professional Services:*), OTHER = anything else.';
comment on column public.invoice_line_recognition.recog_start is
  'First month of recognition. May be < or > invoice txn_date (back- or forward-billed).';
comment on column public.invoice_line_recognition.recog_end is
  'Last month of recognition (inclusive).';
comment on column public.invoice_line_recognition.recog_method is
  'straight_line: amount/months each period. on_receipt: full amount in start month. milestone: manual.';
comment on column public.invoice_line_recognition.contract_code is
  'Soft FK to orderforms.orderform_code. Lets us reconcile invoices vs contract expectations.';

-- ============================================================================
-- View: flatten qbo_invoices.line_items + recognition overlay for the UI.
-- One row per invoice line, annotated or not.
-- ============================================================================

create or replace view public.invoice_lines_with_recognition as
select
  inv.qbo_id            as qbo_invoice_id,
  inv.doc_number,
  inv.customer_qbo_id,
  inv.txn_date,
  inv.total_amount      as invoice_total,
  inv.balance           as invoice_balance,
  inv.status            as invoice_status,
  inv.currency,

  (line->>'Id')         as qbo_line_id,
  (line->>'LineNum')::int as line_num,
  line->'SalesItemLineDetail'->'ItemRef'->>'name' as item_ref,
  line->>'Description'  as description,
  (line->>'Amount')::numeric as amount,
  line->>'DetailType'   as detail_type,

  ilr.line_type,
  ilr.recog_start,
  ilr.recog_end,
  ilr.recog_method,
  ilr.contract_code,
  ilr.notes,
  ilr.annotated_at,
  case when ilr.recog_start is not null and ilr.recog_end is not null then true else false end as is_annotated
from public.qbo_invoices inv
cross join lateral jsonb_array_elements(coalesce(inv.line_items, '[]'::jsonb)) as line
left join public.invoice_line_recognition ilr
  on ilr.qbo_invoice_id = inv.qbo_id
 and ilr.qbo_line_id    = (line->>'Id')
where line->>'DetailType' = 'SalesItemLineDetail';

comment on view public.invoice_lines_with_recognition is
  'Flattened invoice lines with their recognition annotation. Source for the Invoice Recognition UI and the rebuilt fy-build-recognition function.';
