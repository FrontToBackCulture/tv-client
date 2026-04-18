-- ============================================================================
-- Seed — FS line mapping for all 153 QBO accounts
-- ============================================================================
-- Maps every QBO account id to its FS presentation line. Mirrors the FS
-- structure documented in
-- `tv-mgmt-knowledge/0_Financials/fs/accounting-understanding.md` §3, §4.
--
-- Re-runnable — uses ON CONFLICT to update existing mappings.
-- ============================================================================

insert into public.fy_fs_mapping (account_qbo_id, account_name, fs_line, fs_section, display_order, is_contra) values
-- ──────────────────────────────────────────────────────────────────────────
-- P&L — Revenue
-- ──────────────────────────────────────────────────────────────────────────
('50',  'Sales of Product Subscription Revenue', 'pnl.revenue.subscription', 'pnl.revenue', 10, false),
('51',  'Service/Fee Revenue',                   'pnl.revenue.service_fee', 'pnl.revenue', 20, false),
('5',   'Services',                              'pnl.revenue.service_fee', 'pnl.revenue', 21, false),
('47',  'Sales of Product Revenue',              'pnl.revenue.other',       'pnl.revenue', 30, false),
('52',  'Other Primary Revenue',                 'pnl.revenue.other',       'pnl.revenue', 31, false),
('6',   'Billable Expense Income',               'pnl.revenue.other',       'pnl.revenue', 32, false),
('1',   'Uncategorised Income',                  'pnl.revenue.other',       'pnl.revenue', 33, false),
('99',  'Unapplied Cash Payment Income',         'pnl.revenue.other',       'pnl.revenue', 34, false),
('100', 'Discounts given',                       'pnl.revenue.discounts',   'pnl.revenue', 40, true),
('147', 'Refund',                                'pnl.revenue.discounts',   'pnl.revenue', 41, true),

-- ──────────────────────────────────────────────────────────────────────────
-- P&L — Cost of sales
-- ──────────────────────────────────────────────────────────────────────────
('70',  'Cloud Infrastructure',                  'pnl.cogs.cloud_infra',    'pnl.cogs', 10, false),
-- Customer Success payroll (parent + children)
('60',  'COGS Payroll - Customer Success',       'pnl.cogs.payroll_cs',     'pnl.cogs', 20, false),
('111', 'Net Salary',                            'pnl.cogs.payroll_cs',     'pnl.cogs', 21, false),
('62',  'CPF Employee Contribution',             'pnl.cogs.payroll_cs',     'pnl.cogs', 22, false),
('61',  'CPF Employer Contribution',             'pnl.cogs.payroll_cs',     'pnl.cogs', 23, false),
('108', 'CPF Skills Development Levy',           'pnl.cogs.payroll_cs',     'pnl.cogs', 24, false),
('59',  'Bonus',                                 'pnl.cogs.payroll_cs',     'pnl.cogs', 25, false),
('63',  'Benefits',                              'pnl.cogs.payroll_cs',     'pnl.cogs', 26, false),
-- Customer Support payroll
('53',  'COGS Payroll - Customer Support',       'pnl.cogs.payroll_cc',     'pnl.cogs', 30, false),
('112', 'Net Salary',                            'pnl.cogs.payroll_cc',     'pnl.cogs', 31, false),
('57',  'CPF Employee Contribution',             'pnl.cogs.payroll_cc',     'pnl.cogs', 32, false),
('56',  'CPF Employer Contribution',             'pnl.cogs.payroll_cc',     'pnl.cogs', 33, false),
('109', 'CPF Skills Development Levy',           'pnl.cogs.payroll_cc',     'pnl.cogs', 34, false),
('58',  'Benefits',                              'pnl.cogs.payroll_cc',     'pnl.cogs', 35, false),
-- Professional Services payroll
('65',  'COGS Payroll - Professional Services',  'pnl.cogs.payroll_ps',     'pnl.cogs', 40, false),
('113', 'Net Salary',                            'pnl.cogs.payroll_ps',     'pnl.cogs', 41, false),
('67',  'CPF Employee Contribution',             'pnl.cogs.payroll_ps',     'pnl.cogs', 42, false),
('66',  'CPF Employer Contribution',             'pnl.cogs.payroll_ps',     'pnl.cogs', 43, false),
('110', 'CPF Skills Development Levy',           'pnl.cogs.payroll_ps',     'pnl.cogs', 44, false),
('69',  'Bonus',                                 'pnl.cogs.payroll_ps',     'pnl.cogs', 45, false),
('68',  'Benefits',                              'pnl.cogs.payroll_ps',     'pnl.cogs', 46, false),
('64',  'Bonus',                                 'pnl.cogs.payroll_cs',     'pnl.cogs', 27, false),
-- Other COGS
('132', 'COGS Software Subscription',            'pnl.cogs.software',       'pnl.cogs', 50, false),
('72',  'COGS Subcontractors',                   'pnl.cogs.subcontractors', 'pnl.cogs', 60, false),
('71',  'COGS Travel & Entertainment',           'pnl.cogs.travel',         'pnl.cogs', 70, false),
('48',  'Cost of sales',                         'pnl.cogs.other',          'pnl.cogs', 80, false),
('73',  'Other COGS',                            'pnl.cogs.other',          'pnl.cogs', 81, false),

-- ──────────────────────────────────────────────────────────────────────────
-- P&L — Other income
-- ──────────────────────────────────────────────────────────────────────────
('145', 'Govt Rebate/Subsidies',                 'pnl.other_income.grant',        'pnl.other_income', 10, false),
('146', 'Bank Rebate',                           'pnl.other_income.other',        'pnl.other_income', 20, false),
('44',  'Interest Income',                       'pnl.other_income.interest',     'pnl.other_income', 30, false),
('83',  'Intercompany Income',                   'pnl.other_income.intercompany', 'pnl.other_income', 40, false),
('84',  'Other Income',                          'pnl.other_income.other',        'pnl.other_income', 50, false),
('144', 'ThinkVAL Test Payment',                 'pnl.other_income.other',        'pnl.other_income', 51, false),

-- ──────────────────────────────────────────────────────────────────────────
-- P&L — Salary & employee benefits
-- ──────────────────────────────────────────────────────────────────────────
-- Directors (parent id 123, lives under Non CoGs Payroll parent 156)
('123', 'Directors Payroll',                     'pnl.opex.salary_directors', 'pnl.opex.salary', 10, false),
('125', 'Net Salary',                            'pnl.opex.salary_directors', 'pnl.opex.salary', 11, false),
('126', 'CPF Employee Contribution',             'pnl.opex.salary_directors', 'pnl.opex.salary', 12, false),
('127', 'CPF Employer Contribution',             'pnl.opex.salary_directors', 'pnl.opex.salary', 13, false),
('128', 'CPF Skills Development Levy',           'pnl.opex.salary_directors', 'pnl.opex.salary', 14, false),
('156', 'Non CoGs Payroll',                      'pnl.opex.salary_directors', 'pnl.opex.salary', 9,  false),
-- Sales payroll (parent 7)
('7',   'Sales Payroll',                         'pnl.opex.salary_sales',     'pnl.opex.salary', 20, false),
('106', 'Net Salary',                            'pnl.opex.salary_sales',     'pnl.opex.salary', 21, false),
('75',  'CPF Employee Contribution',             'pnl.opex.salary_sales',     'pnl.opex.salary', 22, false),
('74',  'CPF Employer Contribution',             'pnl.opex.salary_sales',     'pnl.opex.salary', 23, false),
('105', 'CPF Skills Development Levy',           'pnl.opex.salary_sales',     'pnl.opex.salary', 24, false),
('77',  'Bonus',                                 'pnl.opex.salary_sales',     'pnl.opex.salary', 25, false),
('76',  'Benefits',                              'pnl.opex.salary_sales',     'pnl.opex.salary', 26, false),
('12',  'Sales Commissions',                     'pnl.opex.salary_sales',     'pnl.opex.salary', 27, false),
-- Marketing payroll (parent 15)
('15',  'Marketing Payroll',                     'pnl.opex.salary_marketing', 'pnl.opex.salary', 30, false),
('16',  'Salaries and Wages',                    'pnl.opex.salary_marketing', 'pnl.opex.salary', 31, false),
('17',  'Payroll Taxes',                         'pnl.opex.salary_marketing', 'pnl.opex.salary', 32, false),
('18',  'Benefits',                              'pnl.opex.salary_marketing', 'pnl.opex.salary', 33, false),
('19',  'Bonus',                                 'pnl.opex.salary_marketing', 'pnl.opex.salary', 34, false),
-- R&D payroll (parent 24)
('24',  'R&D Payroll',                           'pnl.opex.salary_rd',        'pnl.opex.salary', 40, false),
('25',  'Net Salary',                            'pnl.opex.salary_rd',        'pnl.opex.salary', 41, false),
('102', 'CPF Employee Contribution',             'pnl.opex.salary_rd',        'pnl.opex.salary', 42, false),
('26',  'CPF Employer Contribution',             'pnl.opex.salary_rd',        'pnl.opex.salary', 43, false),
('101', 'CPF Skills Development Levy',           'pnl.opex.salary_rd',        'pnl.opex.salary', 44, false),
('28',  'Bonus',                                 'pnl.opex.salary_rd',        'pnl.opex.salary', 45, false),
('27',  'Benefits',                              'pnl.opex.salary_rd',        'pnl.opex.salary', 46, false),
-- G&A payroll (parent 30)
('30',  'G&A Payroll',                           'pnl.opex.salary_ga',        'pnl.opex.salary', 50, false),
('104', 'Net Salary',                            'pnl.opex.salary_ga',        'pnl.opex.salary', 51, false),
('32',  'CPF Employee Contribution',             'pnl.opex.salary_ga',        'pnl.opex.salary', 52, false),
('31',  'CPF Employer Contribution',             'pnl.opex.salary_ga',        'pnl.opex.salary', 53, false),
('103', 'CPF Skills Development Levy',           'pnl.opex.salary_ga',        'pnl.opex.salary', 54, false),
('34',  'Bonus',                                 'pnl.opex.salary_ga',        'pnl.opex.salary', 55, false),
('33',  'Benefits',                              'pnl.opex.salary_ga',        'pnl.opex.salary', 56, false),
-- Intern (parent 129)
('129', 'Intern',                                'pnl.opex.salary_intern',    'pnl.opex.salary', 60, false),
('130', 'Net Salary',                            'pnl.opex.salary_intern',    'pnl.opex.salary', 61, false),
-- Other salary
('143', 'Foreigner Levy',                        'pnl.opex.salary_other',     'pnl.opex.salary', 70, false),
('124', 'Payroll Expenses',                      'pnl.opex.salary_other',     'pnl.opex.salary', 71, false),

-- ──────────────────────────────────────────────────────────────────────────
-- P&L — Admin & other operating expenses
-- ──────────────────────────────────────────────────────────────────────────
('107', 'Bank charges',                          'pnl.opex.bank_charges',        'pnl.opex.admin', 10, false),
('37',  'Rent & Utilities',                      'pnl.opex.rent_utilities',      'pnl.opex.admin', 20, false),
-- Software subscription (parent 118)
('118', 'Software Subscription',                 'pnl.opex.software',            'pnl.opex.admin', 30, false),
('39',  'G&A Software Subscription',             'pnl.opex.software',            'pnl.opex.admin', 31, false),
('115', 'Sales Software Subscription',           'pnl.opex.software',            'pnl.opex.admin', 32, false),
('116', 'Customer Success Software Subscription','pnl.opex.software',            'pnl.opex.admin', 33, false),
('117', 'R&D Software Subscription',             'pnl.opex.software',            'pnl.opex.admin', 34, false),
-- Subcontractors (OpEx)
('78',  'Sales Subcontractors',                  'pnl.opex.subcontractors_sales',     'pnl.opex.admin', 40, false),
('79',  'Marketing Subcontractors',              'pnl.opex.subcontractors_marketing', 'pnl.opex.admin', 41, false),
('80',  'R&D Subcontractors',                    'pnl.opex.subcontractors_rd',        'pnl.opex.admin', 42, false),
('82',  'G&A Subcontractors',                    'pnl.opex.subcontractors_ga',        'pnl.opex.admin', 43, false),
-- Professional / licence / office
('81',  'Professional Services',                 'pnl.opex.professional_fees',  'pnl.opex.admin', 50, false),
('40',  'Licenses, Fees & Insurance',            'pnl.opex.licenses',           'pnl.opex.admin', 51, false),
('38',  'Office Expenses',                       'pnl.opex.office',             'pnl.opex.admin', 52, false),
('134', 'Memberships',                           'pnl.opex.memberships',        'pnl.opex.admin', 53, false),
-- Marketing / advertising
('135', 'Marketing Ads',                         'pnl.opex.marketing_ads',      'pnl.opex.admin', 60, false),
('20',  'Advertising',                           'pnl.opex.advertising',        'pnl.opex.admin', 61, false),
('21',  'Events',                                'pnl.opex.events',             'pnl.opex.admin', 62, false),
('22',  'Promotions',                            'pnl.opex.promotions',         'pnl.opex.admin', 63, false),
('23',  'Other Marketing Expense',               'pnl.opex.other_marketing',    'pnl.opex.admin', 64, false),
-- Travel
('13',  'Sales Travel & Entertainment',          'pnl.opex.travel_sales',       'pnl.opex.admin', 70, false),
('36',  'G&A Meals, Travel & Entertainment',     'pnl.opex.travel_ga',          'pnl.opex.admin', 71, false),
-- Other admin
('41',  'Automobile Expenses',                   'pnl.opex.auto',               'pnl.opex.admin', 80, false),
('42',  'Bad Debt Expense',                      'pnl.opex.bad_debt',           'pnl.opex.admin', 81, false),
('35',  'Other Employee Expenses',               'pnl.opex.other_employee',     'pnl.opex.admin', 82, false),
('155', 'Repair and maintenance',                'pnl.opex.rm',                 'pnl.opex.admin', 83, false),
('46',  'Purchases',                             'pnl.opex.purchases',          'pnl.opex.admin', 84, false),
('97',  'GST Expense',                           'pnl.opex.gst_expense',        'pnl.opex.admin', 85, false),
('43',  'Other G&A Expense',                     'pnl.opex.other_ga',           'pnl.opex.admin', 86, false),
('29',  'Other Product Development Expense',     'pnl.opex.other_product_dev', 'pnl.opex.admin', 87, false),
('14',  'Other Sales Expense',                   'pnl.opex.other_sales',        'pnl.opex.admin', 88, false),
('2',   'Uncategorised Expense',                 'pnl.opex.uncategorised',      'pnl.opex.admin', 89, false),
('122', 'Unapplied Cash Bill Payment Expense',   'pnl.opex.uncategorised',      'pnl.opex.admin', 90, false),
('1150040001', 'late charge',                    'pnl.opex.uncategorised',      'pnl.opex.admin', 91, false),

-- ──────────────────────────────────────────────────────────────────────────
-- P&L — Finance cost / other expense (below the line)
-- ──────────────────────────────────────────────────────────────────────────
('138', 'Interest paid',                         'pnl.finance_cost',            'pnl.finance_cost', 10, false),
('85',  'Interest Expense',                      'pnl.finance_cost',            'pnl.finance_cost', 11, false),
('45',  'Depreciation & Amortization',           'pnl.other_expense.dep_amort', 'pnl.other_expense', 10, false),
('87',  'Taxes',                                 'pnl.other_expense.tax',       'pnl.other_expense', 20, false),
('133', 'Exchange Gain or Loss',                 'pnl.other_expense.fx',        'pnl.other_expense', 30, false),
('86',  'Intercompany Expense',                  'pnl.other_expense.intercompany', 'pnl.other_expense', 40, false),
('88',  'Other Expense',                         'pnl.other_expense.other',     'pnl.other_expense', 50, false),

-- ──────────────────────────────────────────────────────────────────────────
-- Balance Sheet — Current assets
-- ──────────────────────────────────────────────────────────────────────────
('91',  'Cash on hand (DBS)',                    'bs.current_assets.cash',      'bs.current_assets', 10, false),
('90',  'Cash on hand (OCBC)',                   'bs.current_assets.cash',      'bs.current_assets', 11, false),
('159', 'Adjustment (Cash)',                     'bs.current_assets.cash',      'bs.current_assets', 12, false),
('98',  'Trade and other receivables',           'bs.current_assets.ar',        'bs.current_assets', 20, false),
('49',  'Inventory Asset',                       'bs.current_assets.inventory', 'bs.current_assets', 30, false),
('94',  'Undeposited Funds',                     'bs.current_assets.undeposited', 'bs.current_assets', 40, false),
('3',   'Uncategorised Asset',                   'bs.current_assets.other',     'bs.current_assets', 50, false),

-- ──────────────────────────────────────────────────────────────────────────
-- Balance Sheet — Non-current assets
-- ──────────────────────────────────────────────────────────────────────────
('1150040000', 'Intangible Asset – FY2024 Capitalised R&D', 'bs.noncurrent_assets.intangible', 'bs.noncurrent_assets', 10, false),
('114', 'Machinery and equipment',               'bs.noncurrent_assets.ppe',    'bs.noncurrent_assets', 20, false),
('148', 'Furniture and Fixtures',                'bs.noncurrent_assets.ppe',    'bs.noncurrent_assets', 21, false),
('161', 'Rental Deposit',                        'bs.noncurrent_assets.deposits', 'bs.noncurrent_assets', 30, false),

-- ──────────────────────────────────────────────────────────────────────────
-- Balance Sheet — Current liabilities
-- ──────────────────────────────────────────────────────────────────────────
('92',  'Deferred Product Subscription Revenue', 'bs.current_liabilities.deferred_sub',    'bs.current_liabilities', 10, false),
('93',  'Deferred Service/Fee Revenue',          'bs.current_liabilities.deferred_svc',    'bs.current_liabilities', 11, false),
('119', 'Trade and other payables',              'bs.current_liabilities.ap',              'bs.current_liabilities', 20, false),
('142', 'Trade and other payables - EUR',        'bs.current_liabilities.ap',              'bs.current_liabilities', 21, false),
('131', 'Trade and other payables - USD',        'bs.current_liabilities.ap',              'bs.current_liabilities', 22, false),
('95',  'GST Control',                           'bs.current_liabilities.gst_control',     'bs.current_liabilities', 30, false),
('96',  'GST Suspense',                          'bs.current_liabilities.gst_suspense',    'bs.current_liabilities', 31, false),
('121', 'Purchases to be reimbursed (Staff CC)', 'bs.current_liabilities.staff_cc',        'bs.current_liabilities', 40, false),
('151', 'VAL Payment Testing',                   'bs.current_liabilities.val_testing',     'bs.current_liabilities', 50, false),
('158', 'Adjustments (Liabilities)',             'bs.current_liabilities.adjustments',     'bs.current_liabilities', 60, false),

-- ──────────────────────────────────────────────────────────────────────────
-- Balance Sheet — Non-current liabilities (Borrowings)
-- ──────────────────────────────────────────────────────────────────────────
('136', 'DBS 80K Temporary Bridging Loan',       'bs.noncurrent_liabilities.borrowings',   'bs.noncurrent_liabilities', 10, false),
('139', 'DBS 200K Temporary Bridging Loan',      'bs.noncurrent_liabilities.borrowings',   'bs.noncurrent_liabilities', 11, false),
('140', 'OCBC 250K Temporary Bridging Loan',     'bs.noncurrent_liabilities.borrowings',   'bs.noncurrent_liabilities', 12, false),
('160', 'DBS 100K Temporary Bridging Loan',      'bs.noncurrent_liabilities.borrowings',   'bs.noncurrent_liabilities', 13, false),

-- ──────────────────────────────────────────────────────────────────────────
-- Balance Sheet — Equity
-- ──────────────────────────────────────────────────────────────────────────
('153', 'Share capital',                         'bs.equity.ord_share_capital', 'bs.equity', 10, false),
('149', 'Cockpit Ordinary shares',               'bs.equity.ord_share_capital', 'bs.equity', 11, false),
('154', 'SAFE Investment 01',                    'bs.equity.pref_share_capital','bs.equity', 20, false),
('152', 'Dividend Issued',                       'bs.equity.dividend',          'bs.equity', 30, true),
('4',   'Retained Earnings',                     'bs.equity.retained_earnings', 'bs.equity', 40, false),
('89',  'Opening Balance Equity',                'bs.equity.opening_balance',   'bs.equity', 50, false),
('157', 'Adjustment (Equity)',                   'bs.equity.adjustment',        'bs.equity', 60, false)
on conflict (account_qbo_id) do update
  set account_name  = excluded.account_name,
      fs_line       = excluded.fs_line,
      fs_section    = excluded.fs_section,
      display_order = excluded.display_order,
      is_contra     = excluded.is_contra,
      updated_at    = timezone('utc'::text, now());
