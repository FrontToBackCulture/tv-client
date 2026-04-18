-- ============================================================================
-- FY Review — mgmt workspace
-- ============================================================================
-- Tables supporting month-by-month fiscal year hygiene: snapshot capture,
-- per-orderform revenue recognition integrity, closed-FY reconciliation
-- against submitted statutory FS, and per-month close checklists.
--
-- Conventions:
--   * RLS permissive (`using (true) with check (true)`). Mgmt workspace JWT
--     enforces auth; solo-access workspace per README.
--   * Snapshots are append-only — each capture inserts a new row so drift
--     detection can compare against prior captures.
--   * `fs_line` (dotted path, e.g. `pnl.revenue.subscription`) is the stable
--     identifier between QBO account mapping, snapshot lines, and FS
--     reconciliation rows. Account ids rot; fs_line doesn't.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Orderforms — contract master data, seeded from QBO Estimates
-- ---------------------------------------------------------------------------

create table public.orderforms (
  orderform_code      text primary key,
  customer_qbo_id     text,
  customer_name       text,
  start_date          date not null,
  term_months         int not null,
  sub_monthly         numeric(14,2) not null default 0,
  svc_monthly         numeric(14,2) not null default 0,
  sub_total           numeric(14,2) not null default 0,
  svc_total           numeric(14,2) not null default 0,
  source_estimate_id  text,
  status              text not null default 'active',   -- 'active' | 'completed' | 'cancelled'
  notes               text,
  raw                 jsonb,                             -- originating estimate payload for traceability
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_orderforms_customer on public.orderforms (customer_qbo_id);
create index idx_orderforms_status on public.orderforms (status);

create trigger orderforms_updated_at
  before update on public.orderforms
  for each row execute function public.update_updated_at();

alter table public.orderforms enable row level security;
create policy "orderforms_all" on public.orderforms for all using (true) with check (true);

-- ---------------------------------------------------------------------------
-- FS line mapping — QBO account → FS presentation line
-- ---------------------------------------------------------------------------

create table public.fy_fs_mapping (
  account_qbo_id      text primary key,
  account_name        text not null,
  fs_line             text not null,          -- e.g. 'pnl.revenue.subscription'
  fs_section          text not null,          -- e.g. 'pnl.revenue'
  display_order       int not null default 0,
  is_contra           boolean not null default false,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_fy_fs_mapping_section on public.fy_fs_mapping (fs_section, display_order);

create trigger fy_fs_mapping_updated_at
  before update on public.fy_fs_mapping
  for each row execute function public.update_updated_at();

alter table public.fy_fs_mapping enable row level security;
create policy "fy_fs_mapping_all" on public.fy_fs_mapping for all using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Snapshots — monthly and annual capture headers
-- ---------------------------------------------------------------------------

create table public.fy_snapshots (
  id                  uuid primary key default gen_random_uuid(),
  fy_code             text not null,               -- 'FY2024'
  period_start        date not null,
  period_end          date not null,
  period_label        text not null,               -- 'Aug-2023' | 'FY2024'
  granularity         text not null,               -- 'month' | 'year'
  source              text not null,               -- 'qbo' | 'fs' | 'manual'
  is_baseline         boolean not null default false,  -- true for FS-sourced closed-FY rows
  captured_at         timestamptz not null default now(),
  captured_by         text,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_fy_snapshots_fy_period on public.fy_snapshots (fy_code, period_start);
create index idx_fy_snapshots_source_baseline on public.fy_snapshots (source, is_baseline);

create trigger fy_snapshots_updated_at
  before update on public.fy_snapshots
  for each row execute function public.update_updated_at();

alter table public.fy_snapshots enable row level security;
create policy "fy_snapshots_all" on public.fy_snapshots for all using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Snapshot lines — per-account detail belonging to a snapshot
-- ---------------------------------------------------------------------------

create table public.fy_snapshot_lines (
  id                  uuid primary key default gen_random_uuid(),
  snapshot_id         uuid not null references public.fy_snapshots(id) on delete cascade,
  account_qbo_id      text,
  account_name        text not null,
  account_type        text,                        -- 'Income' | 'Expense' | 'Asset' | 'Liability' | 'Equity' | 'COGS' | 'OtherIncome' | 'OtherExpense'
  fs_line             text,
  balance             numeric(14,2),               -- BS accounts: month-end balance
  movement            numeric(14,2),               -- P&L accounts: month's DR-CR movement (signed)
  currency            text not null default 'SGD',
  raw                 jsonb,                        -- originating QBO report row for traceability
  created_at          timestamptz not null default now()
);

create index idx_fy_snapshot_lines_snapshot on public.fy_snapshot_lines (snapshot_id);
create index idx_fy_snapshot_lines_account on public.fy_snapshot_lines (account_qbo_id);
create index idx_fy_snapshot_lines_fs_line on public.fy_snapshot_lines (fs_line);

alter table public.fy_snapshot_lines enable row level security;
create policy "fy_snapshot_lines_all" on public.fy_snapshot_lines for all using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Recognition schedule — per-orderform × month × leg integrity
-- ---------------------------------------------------------------------------

create table public.recognition_schedule (
  id                  uuid primary key default gen_random_uuid(),
  fy_code             text not null,
  orderform_code      text not null,
  customer_qbo_id     text,
  customer_name       text not null,
  leg                 text not null,               -- 'SUB' | 'SVC'
  period_start        date not null,
  period_end          date not null,
  period_index        int not null,                -- 1..N within the orderform's own schedule
  expected_amount     numeric(14,2) not null,
  posted_amount       numeric(14,2),
  posted_je_id        text,
  posted_je_txn_date  date,
  status              text not null default 'expected',  -- 'expected' | 'posted' | 'missing' | 'mismatched' | 'orphan' | 'waived'
  variance            numeric(14,2) generated always as (coalesce(posted_amount,0) - expected_amount) stored,
  notes               text,
  last_checked_at     timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (orderform_code, leg, period_index)
);

create index idx_recognition_schedule_fy_status on public.recognition_schedule (fy_code, status);
create index idx_recognition_schedule_customer on public.recognition_schedule (customer_qbo_id);
create index idx_recognition_schedule_orderform on public.recognition_schedule (orderform_code);
create index idx_recognition_schedule_period on public.recognition_schedule (period_start);

create trigger recognition_schedule_updated_at
  before update on public.recognition_schedule
  for each row execute function public.update_updated_at();

alter table public.recognition_schedule enable row level security;
create policy "recognition_schedule_all" on public.recognition_schedule for all using (true) with check (true);

-- ---------------------------------------------------------------------------
-- FY reconciliations — closed-FY line-by-line FS vs QBO resolution
-- ---------------------------------------------------------------------------

create table public.fy_reconciliations (
  id                  uuid primary key default gen_random_uuid(),
  fy_code             text not null,
  fs_line             text not null,
  fs_line_label       text not null,
  official_amount     numeric(14,2) not null,       -- from submitted FS
  qbo_amount          numeric(14,2),                -- from latest QBO snapshot of this FY close
  variance            numeric(14,2) generated always as (coalesce(qbo_amount,0) - official_amount) stored,
  status              text not null default 'open', -- 'open' | 'investigating' | 'resolved' | 'accepted'
  resolution_note     text,
  resolved_at         timestamptz,
  resolved_by         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (fy_code, fs_line)
);

create index idx_fy_reconciliations_fy on public.fy_reconciliations (fy_code, status);

create trigger fy_reconciliations_updated_at
  before update on public.fy_reconciliations
  for each row execute function public.update_updated_at();

alter table public.fy_reconciliations enable row level security;
create policy "fy_reconciliations_all" on public.fy_reconciliations for all using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Close checklist — per-FY × month close tasks
-- ---------------------------------------------------------------------------

create table public.fy_close_checklist (
  id                  uuid primary key default gen_random_uuid(),
  fy_code             text not null,
  period_start        date not null,               -- month being closed (or FY-start for FY-wide items)
  item_key            text not null,               -- 'bank_rec_dbs', 'gst_f5_filed', etc.
  item_label          text not null,
  category            text not null,               -- 'reconciliation' | 'posting' | 'filing' | 'review'
  status              text not null default 'pending',  -- 'pending' | 'in_progress' | 'done' | 'na'
  due_date            date,
  completed_at        timestamptz,
  completed_by        text,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (fy_code, period_start, item_key)
);

create index idx_fy_close_checklist_fy_period on public.fy_close_checklist (fy_code, period_start);
create index idx_fy_close_checklist_status on public.fy_close_checklist (status);

create trigger fy_close_checklist_updated_at
  before update on public.fy_close_checklist
  for each row execute function public.update_updated_at();

alter table public.fy_close_checklist enable row level security;
create policy "fy_close_checklist_all" on public.fy_close_checklist for all using (true) with check (true);
