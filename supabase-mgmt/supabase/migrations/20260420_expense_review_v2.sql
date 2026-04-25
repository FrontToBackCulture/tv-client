-- ============================================================================
-- expense_lines_unified v2 — add payee_name + fs_line + fs_section.
-- ============================================================================
-- Grouping pivot: Expense Review now groups by FS line (FY Review P&L order)
-- then drills per payee (vendor OR employee). Bake all three resolutions at
-- the view layer so the UI doesn't need four client-side joins.
--
-- Payee name:
--   Bills:    raw.VendorRef.name (always Vendor)
--   Expenses: raw.EntityRef.name (Vendor|Employee|Customer)
-- FS line / section: joined from fy_fs_mapping on account_qbo_id.
-- ============================================================================

-- `create or replace view` can't reshape columns — new fields (payee_name,
-- fs_line, fs_section) inserted mid-stream, column order shifts. Drop + recreate.
drop view if exists public.expense_lines_unified;

create view public.expense_lines_unified as
with bill_lines as (
  select
    'bill'::text              as source_type,
    b.qbo_id                  as source_qbo_id,
    b.doc_number,
    b.vendor_qbo_id           as payee_qbo_id,
    'Vendor'::text            as payee_type,
    coalesce(b.raw->'VendorRef'->>'name', v.display_name) as payee_name,
    b.txn_date,
    b.total_amount            as source_total,
    b.currency,
    null::text                as payment_account_qbo_id,
    null::text                as payment_account_name,
    null::text                as payment_account_type,
    b.private_note,
    (line->>'Id')             as qbo_line_id,
    (line->>'LineNum')::int   as line_num,
    line->>'Description'      as description,
    (line->>'Amount')::numeric as amount,
    line->'AccountBasedExpenseLineDetail'->'AccountRef'->>'value' as account_qbo_id,
    line->'AccountBasedExpenseLineDetail'->'AccountRef'->>'name'  as account_name,
    line->'AccountBasedExpenseLineDetail'->'ClassRef'->>'name'    as class_name
  from public.qbo_bills b
  left join public.qbo_vendors v on v.qbo_id = b.vendor_qbo_id
  cross join lateral jsonb_array_elements(coalesce(b.line_items, '[]'::jsonb)) as line
  where line->>'DetailType' = 'AccountBasedExpenseLineDetail'
),
expense_lines as (
  select
    'expense'::text           as source_type,
    e.qbo_id                  as source_qbo_id,
    null::text                as doc_number,
    e.payee_qbo_id,
    e.payee_type,
    coalesce(
      e.raw->'EntityRef'->>'name',
      case when e.payee_type = 'Vendor' then v.display_name end
    )                         as payee_name,
    e.txn_date,
    e.total_amount            as source_total,
    e.currency,
    e.account_qbo_id          as payment_account_qbo_id,
    pay_acct.name             as payment_account_name,
    pay_acct.account_type     as payment_account_type,
    e.private_note,
    (line->>'Id')             as qbo_line_id,
    (line->>'LineNum')::int   as line_num,
    line->>'Description'      as description,
    (line->>'Amount')::numeric as amount,
    line->'AccountBasedExpenseLineDetail'->'AccountRef'->>'value' as account_qbo_id,
    line->'AccountBasedExpenseLineDetail'->'AccountRef'->>'name'  as account_name,
    line->'AccountBasedExpenseLineDetail'->'ClassRef'->>'name'    as class_name
  from public.qbo_expenses e
  left join public.qbo_accounts pay_acct on pay_acct.qbo_id = e.account_qbo_id
  left join public.qbo_vendors  v        on v.qbo_id = e.payee_qbo_id
  cross join lateral jsonb_array_elements(coalesce(e.line_items, '[]'::jsonb)) as line
  where line->>'DetailType' = 'AccountBasedExpenseLineDetail'
),
unioned as (
  select * from bill_lines
  union all
  select * from expense_lines
)
select
  u.source_type,
  u.source_qbo_id,
  u.qbo_line_id,
  u.line_num,
  u.doc_number,
  u.payee_qbo_id,
  u.payee_type,
  u.payee_name,
  u.txn_date,
  u.source_total,
  u.currency,
  u.payment_account_qbo_id,
  u.payment_account_name,
  u.payment_account_type,
  u.private_note,
  u.description,
  u.amount,
  u.account_qbo_id,
  u.account_name,
  acct.account_type,
  fs.fs_line,
  fs.fs_section,
  u.class_name,
  coalesce(u.payment_account_qbo_id = any(cfg.personal_cc_account_ids), false) as is_personal_cc,
  elr.reviewed_at,
  elr.anomaly_flag,
  elr.anomaly_note,
  elr.claim_status,
  elr.claim_note,
  elr.cap_candidate,
  elr.cap_target_account_qbo_id,
  elr.cap_bucket,
  elr.capitalised_je_qbo_id,
  elr.notes,
  (elr.reviewed_at is not null) as is_reviewed
from unioned u
left join public.qbo_accounts acct on acct.qbo_id = u.account_qbo_id
left join public.fy_fs_mapping fs  on fs.account_qbo_id = u.account_qbo_id
left join public.expense_review_config cfg on cfg.id = 1
left join public.expense_line_review elr
  on elr.source_type   = u.source_type
 and elr.source_qbo_id = u.source_qbo_id
 and elr.qbo_line_id   = u.qbo_line_id
where acct.account_type in ('Expense','Other Expense','Cost of Goods Sold');

comment on view public.expense_lines_unified is
  'Flattened P&L expense lines from qbo_bills + qbo_expenses with payee name, FS mapping, and review overlay.';
