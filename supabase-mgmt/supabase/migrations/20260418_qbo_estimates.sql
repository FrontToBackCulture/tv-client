-- Estimates (quotes/proposals, convert to invoices in QBO)

create table public.qbo_estimates (
  qbo_id text primary key,
  doc_number text,
  customer_qbo_id text,
  txn_date date,
  expiration_date date,
  total_amount numeric(14,2),
  status text,                        -- 'Pending', 'Accepted', 'Closed', 'Rejected'
  accepted_by text,
  accepted_date date,
  currency text,
  private_note text,
  customer_memo text,
  line_items jsonb,
  raw jsonb not null,
  synced_at timestamptz not null default now()
);

create index idx_qbo_estimates_customer on public.qbo_estimates (customer_qbo_id);
create index idx_qbo_estimates_txn_date on public.qbo_estimates (txn_date desc);
create index idx_qbo_estimates_status on public.qbo_estimates (status);

alter table public.qbo_estimates enable row level security;
create policy "qbo_estimates_all" on public.qbo_estimates for all using (true) with check (true);
