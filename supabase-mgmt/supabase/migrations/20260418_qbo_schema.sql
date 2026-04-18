-- ============================================================================
-- QBO schema — mgmt workspace
-- ============================================================================
-- Mirrors QuickBooks Online entities. QBO is source of truth; these tables
-- are a queryable cache + TV overlays. All writes go through QBO API; local
-- mutations are reserved for sync + overlay tables.
--
-- Conventions:
--   * `qbo_id` holds QBO's stable entity ID (text, unique per entity type)
--   * `raw jsonb` keeps full QBO payload for replay/debug
--   * `synced_at` on every mirror table — tells you staleness
--   * RLS: permissive (`using (true)`). Workspace JWT enforces auth.
--   * `qbo_connections` — service role only (holds tokens)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Connection & sync
-- ---------------------------------------------------------------------------

create table public.qbo_connections (
  id uuid primary key default gen_random_uuid(),
  realm_id text not null unique,
  company_name text,
  access_token text,           -- encrypted at app layer before storing
  refresh_token text,          -- encrypted at app layer before storing
  expires_at timestamptz,
  environment text not null default 'production',  -- 'production' | 'sandbox'
  status text not null default 'active',           -- 'active' | 'needs_reauth' | 'disabled'
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger qbo_connections_updated_at
  before update on public.qbo_connections
  for each row execute function public.update_updated_at();

alter table public.qbo_connections enable row level security;

-- No public policies — only service_role can read/write (access via edge functions)

create table public.qbo_sync_runs (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,                    -- 'invoice', 'bill', 'report:pl', 'all', ...
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running',       -- 'running' | 'ok' | 'failed'
  records_processed int default 0,
  error text,
  cursor text,                                  -- CDC cursor for incremental sync
  triggered_by text                             -- 'cron' | 'manual' | 'webhook' | 'tool'
);

create index idx_qbo_sync_runs_entity_started on public.qbo_sync_runs (entity_type, started_at desc);

alter table public.qbo_sync_runs enable row level security;
create policy "qbo_sync_runs_all" on public.qbo_sync_runs for all using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Master data
-- ---------------------------------------------------------------------------

create table public.qbo_accounts (
  qbo_id text primary key,
  name text not null,
  account_type text,                  -- Asset, Liability, Equity, Revenue, Expense
  account_sub_type text,
  classification text,                -- Asset | Liability | Equity | Revenue | Expense
  current_balance numeric(14,2),
  active boolean default true,
  parent_qbo_id text,
  raw jsonb not null,
  synced_at timestamptz not null default now()
);

create index idx_qbo_accounts_type on public.qbo_accounts (account_type);
create index idx_qbo_accounts_parent on public.qbo_accounts (parent_qbo_id);
alter table public.qbo_accounts enable row level security;
create policy "qbo_accounts_all" on public.qbo_accounts for all using (true) with check (true);

create table public.qbo_customers (
  qbo_id text primary key,
  display_name text not null,
  company_name text,
  email text,
  phone text,
  billing_address jsonb,
  balance numeric(14,2) default 0,
  active boolean default true,
  tv_company_id uuid,                 -- optional link to ThinkVAL workspace crm_companies.id (by value, no FK)
  raw jsonb not null,
  synced_at timestamptz not null default now()
);

create index idx_qbo_customers_email on public.qbo_customers (email);
create index idx_qbo_customers_tv_company on public.qbo_customers (tv_company_id);
alter table public.qbo_customers enable row level security;
create policy "qbo_customers_all" on public.qbo_customers for all using (true) with check (true);

create table public.qbo_vendors (
  qbo_id text primary key,
  display_name text not null,
  company_name text,
  email text,
  phone text,
  billing_address jsonb,
  balance numeric(14,2) default 0,
  active boolean default true,
  raw jsonb not null,
  synced_at timestamptz not null default now()
);

create index idx_qbo_vendors_email on public.qbo_vendors (email);
alter table public.qbo_vendors enable row level security;
create policy "qbo_vendors_all" on public.qbo_vendors for all using (true) with check (true);

create table public.qbo_items (
  qbo_id text primary key,
  name text not null,
  type text,                          -- Service | Inventory | NonInventory | Category
  unit_price numeric(14,2),
  income_account_qbo_id text,
  expense_account_qbo_id text,
  active boolean default true,
  raw jsonb not null,
  synced_at timestamptz not null default now()
);

alter table public.qbo_items enable row level security;
create policy "qbo_items_all" on public.qbo_items for all using (true) with check (true);

create table public.qbo_classes (
  qbo_id text primary key,
  name text not null,
  parent_qbo_id text,
  active boolean default true,
  raw jsonb not null,
  synced_at timestamptz not null default now()
);

alter table public.qbo_classes enable row level security;
create policy "qbo_classes_all" on public.qbo_classes for all using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Transactions
-- ---------------------------------------------------------------------------

create table public.qbo_invoices (
  qbo_id text primary key,
  doc_number text,
  customer_qbo_id text,
  txn_date date,
  due_date date,
  total_amount numeric(14,2),
  balance numeric(14,2),
  status text,                        -- e.g., 'Paid', 'Partial', 'Sent', 'NotSent'
  email_status text,
  currency text,
  private_note text,
  customer_memo text,
  line_items jsonb,
  raw jsonb not null,
  synced_at timestamptz not null default now()
);

create index idx_qbo_invoices_customer on public.qbo_invoices (customer_qbo_id);
create index idx_qbo_invoices_txn_date on public.qbo_invoices (txn_date desc);
create index idx_qbo_invoices_balance_unpaid on public.qbo_invoices (balance) where balance > 0;
alter table public.qbo_invoices enable row level security;
create policy "qbo_invoices_all" on public.qbo_invoices for all using (true) with check (true);

create table public.qbo_bills (
  qbo_id text primary key,
  doc_number text,
  vendor_qbo_id text,
  txn_date date,
  due_date date,
  total_amount numeric(14,2),
  balance numeric(14,2),
  currency text,
  private_note text,
  line_items jsonb,
  raw jsonb not null,
  synced_at timestamptz not null default now()
);

create index idx_qbo_bills_vendor on public.qbo_bills (vendor_qbo_id);
create index idx_qbo_bills_txn_date on public.qbo_bills (txn_date desc);
create index idx_qbo_bills_balance_unpaid on public.qbo_bills (balance) where balance > 0;
alter table public.qbo_bills enable row level security;
create policy "qbo_bills_all" on public.qbo_bills for all using (true) with check (true);

create table public.qbo_payments (
  qbo_id text primary key,
  customer_qbo_id text,
  txn_date date,
  total_amount numeric(14,2),
  currency text,
  deposit_to_account_qbo_id text,
  applied_to jsonb,                   -- array of {invoice_qbo_id, amount}
  raw jsonb not null,
  synced_at timestamptz not null default now()
);

create index idx_qbo_payments_customer on public.qbo_payments (customer_qbo_id);
create index idx_qbo_payments_txn_date on public.qbo_payments (txn_date desc);
alter table public.qbo_payments enable row level security;
create policy "qbo_payments_all" on public.qbo_payments for all using (true) with check (true);

create table public.qbo_bill_payments (
  qbo_id text primary key,
  vendor_qbo_id text,
  txn_date date,
  total_amount numeric(14,2),
  currency text,
  pay_type text,                      -- Check | CreditCard
  applied_to jsonb,                   -- array of {bill_qbo_id, amount}
  raw jsonb not null,
  synced_at timestamptz not null default now()
);

create index idx_qbo_bill_payments_vendor on public.qbo_bill_payments (vendor_qbo_id);
create index idx_qbo_bill_payments_txn_date on public.qbo_bill_payments (txn_date desc);
alter table public.qbo_bill_payments enable row level security;
create policy "qbo_bill_payments_all" on public.qbo_bill_payments for all using (true) with check (true);

create table public.qbo_expenses (
  qbo_id text primary key,
  txn_date date,
  total_amount numeric(14,2),
  account_qbo_id text,                -- payment account (bank/credit card)
  payee_qbo_id text,                  -- vendor or customer
  payee_type text,                    -- 'Vendor' | 'Customer' | 'Employee'
  payment_type text,                  -- 'Cash' | 'Check' | 'CreditCard'
  currency text,
  private_note text,
  line_items jsonb,
  raw jsonb not null,
  synced_at timestamptz not null default now()
);

create index idx_qbo_expenses_txn_date on public.qbo_expenses (txn_date desc);
create index idx_qbo_expenses_account on public.qbo_expenses (account_qbo_id);
alter table public.qbo_expenses enable row level security;
create policy "qbo_expenses_all" on public.qbo_expenses for all using (true) with check (true);

create table public.qbo_journal_entries (
  qbo_id text primary key,
  doc_number text,
  txn_date date,
  total_amount numeric(14,2),
  currency text,
  private_note text,
  lines jsonb,                        -- array of {account, amount, posting_type, description}
  raw jsonb not null,
  synced_at timestamptz not null default now()
);

create index idx_qbo_journal_entries_txn_date on public.qbo_journal_entries (txn_date desc);
alter table public.qbo_journal_entries enable row level security;
create policy "qbo_journal_entries_all" on public.qbo_journal_entries for all using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Reports cache
-- ---------------------------------------------------------------------------

create table public.qbo_reports_cache (
  id uuid primary key default gen_random_uuid(),
  report_type text not null,          -- 'ProfitAndLoss' | 'BalanceSheet' | 'CashFlow' | 'AgedReceivables' | 'AgedPayables'
  period_start date,
  period_end date,
  params jsonb not null default '{}',  -- accounting_method, summarize_by, etc.
  data jsonb not null,                 -- full QBO report payload
  generated_at timestamptz not null default now()
);

create unique index uq_qbo_reports_cache_key
  on public.qbo_reports_cache (report_type, period_start, period_end, params);
create index idx_qbo_reports_cache_generated on public.qbo_reports_cache (generated_at desc);

alter table public.qbo_reports_cache enable row level security;
create policy "qbo_reports_cache_all" on public.qbo_reports_cache for all using (true) with check (true);

-- ---------------------------------------------------------------------------
-- TV-specific overlays
-- ---------------------------------------------------------------------------
-- Cross-workspace references stored as uuids without FK enforcement.
-- Integrity is managed at app layer.

create table public.finance_project_links (
  id uuid primary key default gen_random_uuid(),
  qbo_entity_type text not null,      -- 'invoice' | 'bill' | 'customer' | 'expense'
  qbo_id text not null,
  tv_project_id uuid,                 -- ThinkVAL workspace projects.id
  tv_company_id uuid,                 -- ThinkVAL workspace crm_companies.id
  link_source text not null default 'manual',  -- 'manual' | 'auto_by_name' | 'qbo_class'
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (qbo_entity_type, qbo_id)
);

create index idx_finance_project_links_project on public.finance_project_links (tv_project_id);
create index idx_finance_project_links_company on public.finance_project_links (tv_company_id);

create trigger finance_project_links_updated_at
  before update on public.finance_project_links
  for each row execute function public.update_updated_at();

alter table public.finance_project_links enable row level security;
create policy "finance_project_links_all" on public.finance_project_links for all using (true) with check (true);
