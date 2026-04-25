-- ============================================================================
-- Expense line review — overlay on qbo_bills + qbo_expenses line_items
-- ============================================================================
-- Each row annotates ONE line of ONE QBO bill/expense with review status,
-- anomaly flags, Staff-CC claim state, and capitalisation tagging.
--
-- Scope: P&L expense lines only (AccountType in Expense, Other Expense, COGS).
-- Source of truth stays in qbo_bills.line_items / qbo_expenses.line_items.
-- Keyed by (source_type, source_qbo_id, qbo_line_id).
--
-- Capitalisation is batched (typically year-end): tag candidate lines
-- throughout the year, then build one multi-line JE that debits the target
-- asset account and credits each expense account for its subtotal.
-- ============================================================================

create table public.expense_line_review (
  source_type     text not null check (source_type in ('bill','expense')),
  source_qbo_id   text not null,
  qbo_line_id     text not null,

  reviewed_at     timestamptz,
  reviewed_by     uuid,

  anomaly_flag    text check (anomaly_flag in (
    'duplicate','miscoded','uncategorised','round_number','personal_use','other'
  )),
  anomaly_note    text,

  -- Staff-CC claim tracking. Only meaningful when payment account is a
  -- personal-CC account (see expense_review_config.personal_cc_account_ids).
  claim_status    text check (claim_status in ('unclaimed','claimed','reimbursed')),
  claim_note      text,

  -- Capitalisation tagging. Lines tagged with cap_candidate=true are
  -- collected at year-end into a single batch JE. cap_target_account_qbo_id
  -- selects which asset account the cap should hit.
  cap_candidate           boolean not null default false,
  cap_target_account_qbo_id text,
  cap_bucket              text,                    -- e.g. 'FY25 R&D Cap'
  capitalised_je_qbo_id   text,                    -- set after batch JE posts

  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  primary key (source_type, source_qbo_id, qbo_line_id)
);

create index idx_elr_reviewed        on public.expense_line_review (reviewed_at)     where reviewed_at is not null;
create index idx_elr_anomaly         on public.expense_line_review (anomaly_flag)    where anomaly_flag is not null;
create index idx_elr_claim           on public.expense_line_review (claim_status)    where claim_status is not null;
create index idx_elr_cap_candidate   on public.expense_line_review (cap_candidate)   where cap_candidate;
create index idx_elr_cap_je          on public.expense_line_review (capitalised_je_qbo_id) where capitalised_je_qbo_id is not null;

create trigger elr_updated_at
  before update on public.expense_line_review
  for each row execute function public.update_updated_at();

alter table public.expense_line_review enable row level security;
create policy "elr_all" on public.expense_line_review for all using (true) with check (true);

comment on table public.expense_line_review is
  'Per-expense-line annotation on qbo_bills + qbo_expenses line_items. Drives Expense Review tab.';
comment on column public.expense_line_review.source_type is
  '''bill'' = qbo_bills, ''expense'' = qbo_expenses. Different parent tables, same line jsonb shape.';
comment on column public.expense_line_review.claim_status is
  'Staff-CC reimbursement state. Only set when payment account is in expense_review_config.personal_cc_account_ids.';
comment on column public.expense_line_review.cap_candidate is
  'true = should be capitalised at year-end. Builder collects these into a batch JE.';
comment on column public.expense_line_review.capitalised_je_qbo_id is
  'Set after the batch cap JE posts. Locks the line as capitalised.';

-- ============================================================================
-- Singleton config — personal CC accounts, default cap target accounts.
-- ============================================================================

create table public.expense_review_config (
  id                              int primary key default 1,
  personal_cc_account_ids         text[] not null default '{}',
  cap_target_account_ids          text[] not null default '{}',
  updated_at                      timestamptz not null default now(),
  constraint expense_review_config_singleton check (id = 1)
);

create trigger erc_updated_at
  before update on public.expense_review_config
  for each row execute function public.update_updated_at();

alter table public.expense_review_config enable row level security;
create policy "erc_all" on public.expense_review_config for all using (true) with check (true);

-- Seed: Staff CC (121) as personal, four known cap-target assets.
insert into public.expense_review_config (id, personal_cc_account_ids, cap_target_account_ids)
values (1, array['121'], array['114','148','161','1150040000'])
on conflict (id) do nothing;

comment on table public.expense_review_config is
  'Singleton config for Expense Review: which accounts are personal-CC, which are capitalisation targets.';

-- ============================================================================
-- View: unified expense lines from bills + expenses, joined to account data
-- and overlay. One row per P&L line.
-- ============================================================================

create or replace view public.expense_lines_unified as
with bill_lines as (
  select
    'bill'::text              as source_type,
    b.qbo_id                  as source_qbo_id,
    b.doc_number,
    b.vendor_qbo_id           as payee_qbo_id,
    'Vendor'::text            as payee_type,
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
  u.class_name,

  -- Personal-CC flag: expense was paid from a configured personal-CC account.
  coalesce(u.payment_account_qbo_id = any(cfg.personal_cc_account_ids), false) as is_personal_cc,

  -- Overlay fields
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
left join public.expense_review_config cfg on cfg.id = 1
left join public.expense_line_review elr
  on elr.source_type   = u.source_type
 and elr.source_qbo_id = u.source_qbo_id
 and elr.qbo_line_id   = u.qbo_line_id
-- P&L only: Expense, Other Expense, Cost of Goods Sold.
where acct.account_type in ('Expense','Other Expense','Cost of Goods Sold');

comment on view public.expense_lines_unified is
  'Flattened P&L expense lines from qbo_bills + qbo_expenses with account metadata and review overlay.';
