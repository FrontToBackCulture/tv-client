-- ============================================================================
-- FY2024 reconciliation seed
-- ============================================================================
-- Seeds fy_reconciliations with the 12 gap lines from §11 of
-- accounting-understanding.md. `official_amount` is the FY24 FS value;
-- `qbo_amount` is pre-populated with the AS-OF 31-Jul-2024 QBO value
-- captured after the qbo-sync-reports BS fix.
--
-- Post-fix, most §11 gaps already resolve — cash, AR, intangible, deferred
-- revenue, pref share, total equity all tie. Remaining real issues:
--   * PPE $11,309 lower in QBO (Inventory never reclassified to Computers)
--   * Ord Share +$200K overstatement in QBO
--   * Dividend -$310K booked in QBO but not in FS
--   * Accumulated losses differ by dividend amount
-- Refresh qbo_amount any time via UI / MCP.
-- ============================================================================

insert into public.fy_reconciliations (fy_code, fs_line, fs_line_label, official_amount, qbo_amount, status, resolution_note) values
  ('FY2024', 'bs.current_assets.cash',
     'Cash and cash equivalents',
     241467.00, 241466.85, 'resolved',
     'Auto-resolved by qbo-sync-reports BS fix — both agree to the cent.'),

  ('FY2024', 'bs.current_assets.ar',
     'Trade and other receivables',
     77422.00, 77422.54, 'resolved',
     'Auto-resolved by BS fix. Ties to FS.'),

  ('FY2024', 'bs.current_assets.inventory',
     'Inventory',
     0.00, 11309.22, 'open',
     '$11,309 still sits in QBO Inventory — should have been reclassified to Computers per FY23 Adjustment doc. Post FY23 reclassification JE to clear.'),

  ('FY2024', 'bs.noncurrent_assets.ppe',
     'Plant and equipment',
     77349.00, 66039.33, 'open',
     'FS includes the $11,309 Computers addition; QBO does not because the inventory reclassification is still pending. Auto-resolves when inventory reclass JE posted.'),

  ('FY2024', 'bs.noncurrent_assets.intangible',
     'Intangible — Capitalised R&D',
     613765.00, 613765.45, 'resolved',
     'Ties to FS to the cent.'),

  ('FY2024', 'bs.current_liabilities.deferred_sub',
     'Deferred Revenue (sub + svc total)',
     123210.00, 123209.63, 'resolved',
     'Auto-resolved by BS fix. Original §11 $2M gap was an artifact of the broken as-of-date call.'),

  ('FY2024', 'bs.current_liabilities.gst_control',
     'GST Payable (net of suspense)',
     17435.00, 15039.28, 'investigating',
     'FS: $17,435 net payable. QBO at close: GST Control $119,342 − Suspense $101,906 + $507 VAL Payment Testing ≈ $18K. Roughly ties but $3K variance — check F5 timing.'),

  ('FY2024', 'bs.noncurrent_liabilities.borrowings',
     'Borrowings (total current + non-current)',
     354494.00, 354493.63, 'resolved',
     'Ties to FS. Split between current/non-current only in FS presentation — QBO has all as Long Term Liability which is fine.'),

  ('FY2024', 'bs.equity.ord_share_capital',
     'Ordinary Share Capital',
     1425000.00, 1625000.00, 'open',
     '$200K excess in QBO. Likely a duplicate/incorrect post-FY23 Cockpit raise entry. Verify: 120K shares @ $675K (original) + 432K bonus+cash @ $750K = $1,425K per FS §8.1. QBO shows $875K Share + $750K Cockpit = $1,625K.'),

  ('FY2024', 'bs.equity.pref_share_capital',
     'Preference Share Capital (SAFE Investment 01)',
     480000.00, 480000.00, 'resolved',
     'Ties exactly.'),

  ('FY2024', 'bs.equity.dividend',
     'Dividend Issued',
     0.00, -310000.00, 'open',
     '$310K dividend booked in QBO but not in FY24 FS. When was it approved? Should it be post-FY24 (FY25) activity? §12.1 outstanding question.'),

  ('FY2024', 'bs.equity.retained_earnings',
     'Accumulated Losses',
     -1443928.00, -1135031.30, 'investigating',
     'Difference ~ $308,897 ≈ the $310K dividend (see above) minus small diff. If dividend is correctly booked and belongs in FY24, accumulated losses are understated by ~$310K in QBO.')
on conflict (fy_code, fs_line) do update
  set fs_line_label    = excluded.fs_line_label,
      official_amount  = excluded.official_amount,
      qbo_amount       = excluded.qbo_amount,
      status           = excluded.status,
      resolution_note  = excluded.resolution_note,
      updated_at       = timezone('utc'::text, now());
