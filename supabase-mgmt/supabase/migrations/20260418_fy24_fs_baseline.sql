-- ============================================================================
-- FY2024 FS baseline — seed from submitted statutory financial statements
-- ============================================================================
-- Creates one fy_snapshots row (granularity=year, source=fs, is_baseline=true)
-- + one fy_snapshot_line per FS presentation line. Numbers sourced from
-- `tv-mgmt-knowledge/0_Financials/fs/accounting-understanding.md` §3 (P&L)
-- and §4 (BS).
--
-- Re-runnable: uses a deterministic snapshot id via ON CONFLICT so the
-- baseline can be refreshed without duplicating.
-- ============================================================================

-- Use a fixed UUID so we can reference it cleanly
do $$
declare
  snap_id uuid := 'fb240000-0000-0000-0000-000000000001';
begin

  -- Delete + insert is cleanest for an immutable baseline
  delete from public.fy_snapshot_lines where snapshot_id = snap_id;
  delete from public.fy_snapshots where id = snap_id;

  insert into public.fy_snapshots (
    id, fy_code, period_start, period_end, period_label,
    granularity, source, is_baseline, captured_at, captured_by, notes
  ) values (
    snap_id, 'FY2024', '2023-08-01', '2024-07-31', 'FY2024',
    'year', 'fs', true, now(), 'seed',
    'Official FY2024 unaudited FS — ThinkVAL Pte. Ltd. (FS_FY2024.pdf)'
  );

  insert into public.fy_snapshot_lines (snapshot_id, account_qbo_id, account_name, account_type, fs_line, movement, balance) values
    -- ── P&L (FY movements) ───────────────────────────────────────────────
    -- Revenue
    (snap_id, null, 'Subscription Revenue',                'pnl', 'pnl.revenue.subscription', 586537, null),
    (snap_id, null, 'Service / Fee Revenue',               'pnl', 'pnl.revenue.service_fee',  315892, null),
    -- Cost of sales
    (snap_id, null, 'Cloud Infrastructure',                'pnl', 'pnl.cogs.cloud_infra',     139962, null),
    (snap_id, null, 'COGS Payroll (CS+CC+PS aggregate)',   'pnl', 'pnl.cogs.payroll_cs',      318232, null),
    (snap_id, null, 'COGS Software / Subcontractors / T&E','pnl', 'pnl.cogs.subcontractors',    6061, null),
    -- Other income
    (snap_id, null, 'Government Grant',                    'pnl', 'pnl.other_income.grant',    84200, null),
    (snap_id, null, 'Other Income (bank rebate etc)',      'pnl', 'pnl.other_income.other',      532, null),
    -- Salary & employee benefits (OpEx)
    (snap_id, null, 'Directors Payroll',                   'pnl', 'pnl.opex.salary_directors',255063, null),
    (snap_id, null, 'Directors CPF',                       'pnl', 'pnl.opex.salary_directors', 22103, null),
    (snap_id, null, 'Staff Salary',                        'pnl', 'pnl.opex.salary_ga',       113720, null),
    (snap_id, null, 'Staff CPF + SDL',                     'pnl', 'pnl.opex.salary_ga',        19274, null),
    (snap_id, null, 'Intern',                              'pnl', 'pnl.opex.salary_intern',     5818, null),
    -- Admin & other operating expenses
    (snap_id, null, 'Bank Charges',                        'pnl', 'pnl.opex.bank_charges',      2152, null),
    (snap_id, null, 'Rent & Utilities',                    'pnl', 'pnl.opex.rent_utilities',   61769, null),
    (snap_id, null, 'Software Subscription',               'pnl', 'pnl.opex.software',         16709, null),
    (snap_id, null, 'Professional Fee',                    'pnl', 'pnl.opex.professional_fees', 2400, null),
    (snap_id, null, 'Other Admin',                         'pnl', 'pnl.opex.other_ga',          1715, null),
    (snap_id, null, 'Other Small (office, membership, mktg, T&E)','pnl', 'pnl.opex.office',     5210, null),
    -- Finance cost
    (snap_id, null, 'Interest / Finance Cost',             'pnl', 'pnl.finance_cost',          15870, null),
    -- Net profit (memo row)
    (snap_id, null, 'Net Profit for the Year',             'pnl', 'pnl.net_profit',             1103, null),

    -- ── Balance Sheet (31-Jul-2024 balances) ─────────────────────────────
    -- Current assets
    (snap_id, null, 'Cash and cash equivalents',           'bs', 'bs.current_assets.cash',      null, 241467),
    (snap_id, null, 'Trade and other receivables',         'bs', 'bs.current_assets.ar',        null,  77422),
    (snap_id, null, 'Inventory',                           'bs', 'bs.current_assets.inventory', null,      0),
    -- Non-current assets
    (snap_id, null, 'Plant and equipment',                 'bs', 'bs.noncurrent_assets.ppe',      null,  77349),
    (snap_id, null, 'Intangible — Capitalised R&D',        'bs', 'bs.noncurrent_assets.intangible',null, 613765),
    (snap_id, null, 'Rental Deposit',                      'bs', 'bs.noncurrent_assets.deposits', null,   1318),
    -- Current liabilities
    (snap_id, null, 'Deferred Revenue (sub + svc total)',  'bs', 'bs.current_liabilities.deferred_sub', null, 123210),
    (snap_id, null, 'GST Payable (net)',                   'bs', 'bs.current_liabilities.gst_control',   null, 17435),
    (snap_id, null, 'Other Payables',                      'bs', 'bs.current_liabilities.ap',            null, 55110),
    (snap_id, null, 'Borrowings — current portion',        'bs', 'bs.current_liabilities.borrowings',    null,101289),
    -- Non-current liabilities
    (snap_id, null, 'Borrowings — non-current portion',    'bs', 'bs.noncurrent_liabilities.borrowings', null,253205),
    -- Equity
    (snap_id, null, 'Ordinary Share Capital',              'bs', 'bs.equity.ord_share_capital',          null,1425000),
    (snap_id, null, 'Preference Share Capital (SAFE)',     'bs', 'bs.equity.pref_share_capital',         null, 480000),
    (snap_id, null, 'Accumulated Losses',                  'bs', 'bs.equity.retained_earnings',          null,-1443928);

end $$;
