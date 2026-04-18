-- ============================================================================
-- FY Drift Alerts — detect changes to closed-period snapshots
-- ============================================================================
-- When a new capture for a previously-captured period shows a different value
-- for any account line, the watchdog inserts a row here. Gives Melvin a
-- persistent record of when/how a closed-period balance drifted, so he can
-- investigate backdated JEs or unintended edits.
-- ============================================================================

create table public.fy_drift_alerts (
  id                  uuid primary key default gen_random_uuid(),
  fy_code             text not null,
  period_start        date not null,
  account_qbo_id      text,
  account_name        text not null,
  fs_line             text,
  amount_field        text not null,             -- 'balance' | 'movement'
  old_value           numeric(14,2),
  new_value           numeric(14,2),
  delta               numeric(14,2) generated always as (coalesce(new_value,0) - coalesce(old_value,0)) stored,
  snapshot_id_prior   uuid references public.fy_snapshots(id) on delete set null,
  snapshot_id_new     uuid references public.fy_snapshots(id) on delete set null,
  detected_at         timestamptz not null default now(),
  status              text not null default 'open',  -- 'open' | 'acknowledged' | 'investigated' | 'resolved'
  note                text,
  acknowledged_at     timestamptz,
  acknowledged_by     text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_fy_drift_alerts_fy_period on public.fy_drift_alerts (fy_code, period_start);
create index idx_fy_drift_alerts_status on public.fy_drift_alerts (status, detected_at desc);
create index idx_fy_drift_alerts_account on public.fy_drift_alerts (account_qbo_id);

create trigger fy_drift_alerts_updated_at
  before update on public.fy_drift_alerts
  for each row execute function public.update_updated_at();

alter table public.fy_drift_alerts enable row level security;
create policy "fy_drift_alerts_all" on public.fy_drift_alerts for all using (true) with check (true);
