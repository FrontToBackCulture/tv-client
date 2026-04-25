-- Extend expense_lines_unified to include journal-entry postings on expense
-- accounts. Motivated by the reversal-accrual workflow: a Dr to CPF Expense in
-- the prior month + a Cr in the clicked month must show up in the Expense
-- Review grid for the monthly shift to be visible.
--
-- Sign convention for JE lines: DR on an expense account = +amount (expense
-- increases), CR on an expense account = -amount (expense decreases/reverses).
-- Bills and expenses always post as DR to the expense account so their amount
-- stays positive as-is.

CREATE OR REPLACE VIEW expense_lines_unified AS
WITH bill_lines AS (
  SELECT
    'bill'::text AS source_type,
    b.qbo_id AS source_qbo_id,
    b.doc_number,
    b.vendor_qbo_id AS payee_qbo_id,
    'Vendor'::text AS payee_type,
    COALESCE((b.raw -> 'VendorRef') ->> 'name', v.display_name) AS payee_name,
    b.txn_date,
    b.total_amount AS source_total,
    b.currency,
    NULL::text AS payment_account_qbo_id,
    NULL::text AS payment_account_name,
    NULL::text AS payment_account_type,
    b.private_note,
    line.value ->> 'Id' AS qbo_line_id,
    (line.value ->> 'LineNum')::integer AS line_num,
    line.value ->> 'Description' AS description,
    (line.value ->> 'Amount')::numeric AS amount,
    ((line.value -> 'AccountBasedExpenseLineDetail') -> 'AccountRef') ->> 'value' AS account_qbo_id,
    ((line.value -> 'AccountBasedExpenseLineDetail') -> 'AccountRef') ->> 'name' AS account_name,
    ((line.value -> 'AccountBasedExpenseLineDetail') -> 'ClassRef') ->> 'name' AS class_name
  FROM qbo_bills b
    LEFT JOIN qbo_vendors v ON v.qbo_id = b.vendor_qbo_id
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(b.line_items, '[]'::jsonb)) line(value)
  WHERE (line.value ->> 'DetailType') = 'AccountBasedExpenseLineDetail'
),
expense_lines AS (
  SELECT
    'expense'::text AS source_type,
    e.qbo_id AS source_qbo_id,
    NULL::text AS doc_number,
    e.payee_qbo_id,
    e.payee_type,
    COALESCE(
      (e.raw -> 'EntityRef') ->> 'name',
      CASE WHEN e.payee_type = 'Vendor' THEN v.display_name ELSE NULL END
    ) AS payee_name,
    e.txn_date,
    e.total_amount AS source_total,
    e.currency,
    e.account_qbo_id AS payment_account_qbo_id,
    pay_acct.name AS payment_account_name,
    pay_acct.account_type AS payment_account_type,
    e.private_note,
    line.value ->> 'Id' AS qbo_line_id,
    (line.value ->> 'LineNum')::integer AS line_num,
    line.value ->> 'Description' AS description,
    (line.value ->> 'Amount')::numeric AS amount,
    ((line.value -> 'AccountBasedExpenseLineDetail') -> 'AccountRef') ->> 'value' AS account_qbo_id,
    ((line.value -> 'AccountBasedExpenseLineDetail') -> 'AccountRef') ->> 'name' AS account_name,
    ((line.value -> 'AccountBasedExpenseLineDetail') -> 'ClassRef') ->> 'name' AS class_name
  FROM qbo_expenses e
    LEFT JOIN qbo_accounts pay_acct ON pay_acct.qbo_id = e.account_qbo_id
    LEFT JOIN qbo_vendors v ON v.qbo_id = e.payee_qbo_id
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(e.line_items, '[]'::jsonb)) line(value)
  WHERE (line.value ->> 'DetailType') = 'AccountBasedExpenseLineDetail'
),
je_lines AS (
  SELECT
    'journal_entry'::text AS source_type,
    je.qbo_id AS source_qbo_id,
    je.doc_number,
    ((line.value -> 'JournalEntryLineDetail' -> 'Entity' -> 'EntityRef') ->> 'value') AS payee_qbo_id,
    (line.value -> 'JournalEntryLineDetail' -> 'Entity') ->> 'Type' AS payee_type,
    COALESCE(
      (line.value -> 'JournalEntryLineDetail' -> 'Entity' -> 'EntityRef') ->> 'name',
      v.display_name,
      c.display_name
    ) AS payee_name,
    je.txn_date,
    je.total_amount AS source_total,
    je.currency,
    NULL::text AS payment_account_qbo_id,
    NULL::text AS payment_account_name,
    NULL::text AS payment_account_type,
    je.private_note,
    line.value ->> 'Id' AS qbo_line_id,
    (line.value ->> 'LineNum')::integer AS line_num,
    line.value ->> 'Description' AS description,
    -- DR on an expense account increases expense (+amount). CR reverses
    -- it (-amount). The final WHERE filters to expense accounts only so
    -- the liability-side legs of the accrual pair drop out.
    CASE
      WHEN (line.value -> 'JournalEntryLineDetail') ->> 'PostingType' = 'Credit'
        THEN -((line.value ->> 'Amount')::numeric)
      ELSE (line.value ->> 'Amount')::numeric
    END AS amount,
    ((line.value -> 'JournalEntryLineDetail') -> 'AccountRef') ->> 'value' AS account_qbo_id,
    ((line.value -> 'JournalEntryLineDetail') -> 'AccountRef') ->> 'name' AS account_name,
    ((line.value -> 'JournalEntryLineDetail') -> 'ClassRef') ->> 'name' AS class_name
  FROM qbo_journal_entries je
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(je.lines, '[]'::jsonb)) line(value)
    LEFT JOIN qbo_vendors v
      ON v.qbo_id = ((line.value -> 'JournalEntryLineDetail' -> 'Entity' -> 'EntityRef') ->> 'value')
      AND (line.value -> 'JournalEntryLineDetail' -> 'Entity') ->> 'Type' = 'Vendor'
    LEFT JOIN qbo_customers c
      ON c.qbo_id = ((line.value -> 'JournalEntryLineDetail' -> 'Entity' -> 'EntityRef') ->> 'value')
      AND (line.value -> 'JournalEntryLineDetail' -> 'Entity') ->> 'Type' = 'Customer'
  WHERE (line.value ->> 'DetailType') = 'JournalEntryLineDetail'
),
unioned AS (
  SELECT * FROM bill_lines
  UNION ALL SELECT * FROM expense_lines
  UNION ALL SELECT * FROM je_lines
)
SELECT
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
  COALESCE(u.payment_account_qbo_id = ANY (cfg.personal_cc_account_ids), false) AS is_personal_cc,
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
  elr.reviewed_at IS NOT NULL AS is_reviewed
FROM unioned u
  LEFT JOIN qbo_accounts acct ON acct.qbo_id = u.account_qbo_id
  LEFT JOIN fy_fs_mapping fs ON fs.account_qbo_id = u.account_qbo_id
  LEFT JOIN expense_review_config cfg ON cfg.id = 1
  LEFT JOIN expense_line_review elr
    ON elr.source_type = u.source_type
    AND elr.source_qbo_id = u.source_qbo_id
    AND elr.qbo_line_id = u.qbo_line_id
WHERE acct.account_type = ANY (ARRAY['Expense', 'Other Expense', 'Cost of Goods Sold']);
