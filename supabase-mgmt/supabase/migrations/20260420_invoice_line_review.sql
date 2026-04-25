-- ============================================================================
-- invoice_line_recognition — add reviewed_at/reviewed_by
-- ============================================================================
-- Once a user has reviewed an invoice line's JE attribution and is happy with
-- it, they can "lock in" the line. This writes:
--   * `reviewed_at` on the invoice_line_recognition row
--   * one je_invoice_line_overrides row per currently-matched JE pointing to
--     this (invoice, line)
--
-- The override rows are what makes the attribution authoritative — the
-- matcher consults overrides first. This column just records that a human
-- signed off, so the UI can show a "Reviewed" badge and a "Lock/Unlock"
-- toggle.
-- ============================================================================

alter table public.invoice_line_recognition
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid;

comment on column public.invoice_line_recognition.reviewed_at is
  'When the user locked in the JE attribution for this line. The authoritative part is in je_invoice_line_overrides — this is the UI marker.';

-- Refresh the helper view to surface reviewed_at to the client.
-- Drop first because CREATE OR REPLACE can't change column ordering.
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
  case when ilr.recog_start is not null and ilr.recog_end is not null then true else false end as is_annotated,
  case when ilr.reviewed_at is not null then true else false end as is_reviewed
from public.qbo_invoices inv
cross join lateral jsonb_array_elements(coalesce(inv.line_items, '[]'::jsonb)) as line
left join public.invoice_line_recognition ilr
  on ilr.qbo_invoice_id = inv.qbo_id
 and ilr.qbo_line_id    = (line->>'Id')
where line->>'DetailType' = 'SalesItemLineDetail';
