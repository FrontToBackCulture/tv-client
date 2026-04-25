-- ============================================================================
-- invoice_line_recognition — add accepted_as_adjustment
-- ============================================================================
-- Some invoices are late/back-billed for revenue already recognised elsewhere
-- (manual JEs, different period, different booking scheme). They need no
-- recognition JEs of their own — but "Lock in review" requires matched JEs,
-- and the default auto-revoke kicks them back to the problem queue whenever
-- we load the view.
--
-- `accepted_as_adjustment = true` marks a line as "no recognition expected,
-- this is a billing-only adjustment". The UI:
--   * hides it from the problem set (no red tint, not in sidebar's "issues")
--   * skips the auto-revoke-when-0-JEs rule
--   * doesn't require recog_start/recog_end
--   * shows a "📌 Adjustment" pill in place of "✓ Reviewed"
-- ============================================================================

alter table public.invoice_line_recognition
  add column if not exists accepted_as_adjustment boolean not null default false;

comment on column public.invoice_line_recognition.accepted_as_adjustment is
  'Line is a late/back-billed invoice for already-recognised revenue. No JEs expected.';

-- Refresh view to surface the flag.
drop view if exists public.invoice_lines_with_recognition;

create view public.invoice_lines_with_recognition as
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
  ilr.reviewed_at,
  ilr.accepted_as_adjustment,
  case when ilr.recog_start is not null and ilr.recog_end is not null then true else false end as is_annotated,
  case when ilr.reviewed_at is not null then true else false end as is_reviewed
from public.qbo_invoices inv
cross join lateral jsonb_array_elements(coalesce(inv.line_items, '[]'::jsonb)) as line
left join public.invoice_line_recognition ilr
  on ilr.qbo_invoice_id = inv.qbo_id
 and ilr.qbo_line_id    = (line->>'Id')
where line->>'DetailType' = 'SalesItemLineDetail';
