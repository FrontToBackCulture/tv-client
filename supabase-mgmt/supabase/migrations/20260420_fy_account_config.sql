-- ============================================================================
-- fy_account_config — singleton account mapping for recognition JE creation
-- ============================================================================
-- Recognition JE shape (per invoice line × month):
--   DR  <deferred revenue account, by line_type>     amount
--   CR  <revenue account, by line_type>              amount
--
-- ThinkVAL has separate deferred & revenue accounts for SUB and SVC, so this
-- holds 6 refs (3 deferred + 3 revenue). Defaults seeded from fy_fs_mapping
-- using the fs_lines from yesterday's mapping seed:
--
--   SUB    deferred → bs.current_liabilities.deferred_sub
--          revenue  → pnl.revenue.subscription
--   SVC    deferred → bs.current_liabilities.deferred_svc
--          revenue  → pnl.revenue.service_fee
--   OTHER  deferred → bs.current_liabilities.deferred_sub  (no dedicated account; user can override)
--          revenue  → pnl.revenue.other (lowest display_order pick)
--
-- One row only — id pinned to 1 by check constraint.
--
-- Idempotent: drops any prior version of the table since the schema reshape
-- (1 deferred → 3 deferred) makes ALTER messier than recreate. No real data
-- lives here yet — only auto-seeded defaults.
-- ============================================================================

drop table if exists public.fy_account_config;

create table public.fy_account_config (
  id                                int primary key default 1 check (id = 1),

  -- Deferred-revenue (Liability) accounts. Soft refs to qbo_accounts.qbo_id
  -- (no FK so a missing/renamed account doesn't break the row).
  deferred_sub_account_qbo_id       text,
  deferred_svc_account_qbo_id       text,
  deferred_other_account_qbo_id     text,

  -- Revenue accounts the recognition JE credits, by line_type.
  revenue_sub_account_qbo_id        text,
  revenue_svc_account_qbo_id        text,
  revenue_other_account_qbo_id      text,

  -- JE marker: PrivateNote on every TV-generated recognition JE starts with
  -- this so we can safely re-detect them (and skip them) on re-sync.
  je_memo_prefix                    text not null default '[TV-RECOG]',

  -- DocNumber template used when posting to QBO. Tokens: {doc_number}, {type},
  -- {period_index}. Default matches existing memo regex.
  je_doc_number_template            text not null default '{doc_number}-{type}-{period_index}',

  notes                             text,
  updated_at                        timestamptz not null default now(),
  updated_by                        uuid
);

create trigger fy_account_config_updated_at
  before update on public.fy_account_config
  for each row execute function public.update_updated_at();

alter table public.fy_account_config enable row level security;
create policy "fy_account_config_all" on public.fy_account_config for all using (true) with check (true);

-- Seed singleton with auto-detected defaults from fy_fs_mapping. Each subquery
-- returns null if the fs_line isn't mapped — user can fill it in via UI.
insert into public.fy_account_config (
  id,
  deferred_sub_account_qbo_id,
  deferred_svc_account_qbo_id,
  deferred_other_account_qbo_id,
  revenue_sub_account_qbo_id,
  revenue_svc_account_qbo_id,
  revenue_other_account_qbo_id
) values (
  1,
  (select account_qbo_id from public.fy_fs_mapping where fs_line = 'bs.current_liabilities.deferred_sub' order by display_order limit 1),
  (select account_qbo_id from public.fy_fs_mapping where fs_line = 'bs.current_liabilities.deferred_svc' order by display_order limit 1),
  (select account_qbo_id from public.fy_fs_mapping where fs_line = 'bs.current_liabilities.deferred_sub' order by display_order limit 1),  -- default OTHER → SUB
  (select account_qbo_id from public.fy_fs_mapping where fs_line = 'pnl.revenue.subscription' order by display_order limit 1),
  (select account_qbo_id from public.fy_fs_mapping where fs_line = 'pnl.revenue.service_fee' order by display_order limit 1),
  (select account_qbo_id from public.fy_fs_mapping where fs_line = 'pnl.revenue.other' order by display_order limit 1)
)
on conflict (id) do nothing;

comment on table public.fy_account_config is
  'Singleton config for recognition JE generation. Holds the QBO account refs (3 deferred + 3 revenue) and the memo/doc-number convention used when posting to QBO.';
comment on column public.fy_account_config.je_memo_prefix is
  'Marker on PrivateNote of every TV-generated recognition JE. Used for safe re-detection on re-sync.';
comment on column public.fy_account_config.je_doc_number_template is
  'Template for QBO JE.DocNumber. Tokens: {doc_number}, {type}, {period_index}.';
