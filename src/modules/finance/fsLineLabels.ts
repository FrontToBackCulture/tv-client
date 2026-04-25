// Shared FS-line display labels + section ordering. Used by FY Review and
// Expense Review to keep the P&L/BS nomenclature identical across tabs.

export const FS_LINE_LABELS: Record<string, string> = {
  // Revenue
  "pnl.revenue.subscription": "Sales of Product Subscription Revenue",
  "pnl.revenue.service_fee": "Service/Fee Revenue",
  "pnl.revenue.other": "Other Revenue",
  "pnl.revenue.discounts": "Discounts / Refunds",
  // Cost of Sales
  "pnl.cogs.cloud_infra": "Cloud Infrastructure",
  "pnl.cogs.payroll_cs": "COGS Payroll - Customer Success",
  "pnl.cogs.payroll_cc": "COGS Payroll - Customer Support",
  "pnl.cogs.payroll_ps": "COGS Payroll - Professional Services",
  "pnl.cogs.software": "COGS Software Subscription",
  "pnl.cogs.subcontractors": "COGS Subcontractors",
  "pnl.cogs.travel": "COGS Travel & Entertainment",
  "pnl.cogs.other": "Other COGS",
  // Other Revenue
  "pnl.other_income.grant": "Govt Rebate/Subsidies",
  "pnl.other_income.interest": "Interest Income",
  "pnl.other_income.intercompany": "Intercompany Income",
  "pnl.other_income.other": "Bank Rebate / Other Income",
  // Expenses — salary
  "pnl.opex.salary_directors": "Directors Payroll",
  "pnl.opex.salary_sales": "Sales Payroll",
  "pnl.opex.salary_marketing": "Marketing Payroll",
  "pnl.opex.salary_rd": "R&D Payroll",
  "pnl.opex.salary_ga": "G&A Payroll",
  "pnl.opex.salary_intern": "Intern",
  "pnl.opex.salary_other": "Other Payroll",
  // Expenses — admin
  "pnl.opex.bank_charges": "Bank charges",
  "pnl.opex.rent_utilities": "Rent & Utilities",
  "pnl.opex.software": "Software Subscription",
  "pnl.opex.subcontractors_sales": "Sales Subcontractors",
  "pnl.opex.subcontractors_marketing": "Marketing Subcontractors",
  "pnl.opex.subcontractors_rd": "R&D Subcontractors",
  "pnl.opex.subcontractors_ga": "G&A Subcontractors",
  "pnl.opex.professional_fees": "Professional Services",
  "pnl.opex.licenses": "Licenses, Fees & Insurance",
  "pnl.opex.office": "Office Expenses",
  "pnl.opex.memberships": "Memberships",
  "pnl.opex.marketing_ads": "Marketing Ads",
  "pnl.opex.advertising": "Advertising",
  "pnl.opex.events": "Events",
  "pnl.opex.promotions": "Promotions",
  "pnl.opex.other_marketing": "Other Marketing Expense",
  "pnl.opex.travel_sales": "Sales Travel & Entertainment",
  "pnl.opex.travel_ga": "G&A Meals, Travel & Entertainment",
  "pnl.opex.auto": "Automobile Expenses",
  "pnl.opex.bad_debt": "Bad Debt Expense",
  "pnl.opex.other_employee": "Other Employee Expenses",
  "pnl.opex.rm": "Repair and maintenance",
  "pnl.opex.purchases": "Purchases",
  "pnl.opex.gst_expense": "GST Expense",
  "pnl.opex.other_ga": "Other G&A Expense",
  "pnl.opex.other_product_dev": "Other Product Development Expense",
  "pnl.opex.other_sales": "Other Sales Expense",
  "pnl.opex.uncategorised": "Uncategorised",
  "pnl.finance_cost": "Interest paid",
  // Other Expenses
  "pnl.other_expense.dep_amort": "Depreciation & Amortization",
  "pnl.other_expense.tax": "Taxes",
  "pnl.other_expense.fx": "Exchange Gain or Loss",
  "pnl.other_expense.intercompany": "Intercompany Expense",
  "pnl.other_expense.other": "Other Expense",
  // Net profit (FS baseline only)
  "pnl.net_profit": "Profit/Loss",
};

// Underlying fy_fs_mapping.fs_section splits OpEx (salary / admin /
// finance_cost) for flexibility, but the display collapses them into a
// single "Expenses" block — matching QBO's P&L report.
export function displaySection(fs_section: string | null | undefined): string {
  if (!fs_section) return "pnl.unmapped";
  if (fs_section === "pnl.opex.salary" || fs_section === "pnl.opex.admin" || fs_section === "pnl.finance_cost") {
    return "pnl.expenses";
  }
  if (fs_section === "pnl.other_income") return "pnl.other_revenue";
  if (fs_section === "pnl.other_expense") return "pnl.other_expenses";
  return fs_section;
}

export const SECTION_ORDER: Record<string, number> = {
  "pnl.revenue": 10,
  "pnl.cogs": 20,
  "pnl.other_revenue": 30,
  "pnl.expenses": 40,
  "pnl.other_expenses": 50,
  "pnl.unmapped": 99,
  "bs.noncurrent_assets": 110,
  "bs.current_assets": 120,
  "bs.equity": 130,
  "bs.noncurrent_liabilities": 140,
  "bs.current_liabilities": 150,
  "bs.unmapped": 199,
};

export function sectionOrder(section: string): number {
  return SECTION_ORDER[section] ?? 999;
}

export function sectionLabel(section: string): string {
  const map: Record<string, string> = {
    "pnl.revenue": "Revenue",
    "pnl.cogs": "Cost of Sales",
    "pnl.other_revenue": "Other Revenue",
    "pnl.expenses": "Expenses",
    "pnl.other_expenses": "Other Expenses",
    "pnl.unmapped": "Unmapped",
    "bs.current_assets": "Current assets",
    "bs.noncurrent_assets": "Non-current assets",
    "bs.current_liabilities": "Current liabilities",
    "bs.noncurrent_liabilities": "Non-current liabilities",
    "bs.equity": "Equity",
  };
  return map[section] ?? section;
}

function titleCaseLeaf(fsLine: string): string {
  const leaf = fsLine.split(".").pop() ?? fsLine;
  return leaf.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export function fsLineDisplayLabel(fs_line: string | null | undefined): string {
  if (!fs_line) return "Unmapped";
  return FS_LINE_LABELS[fs_line] ?? titleCaseLeaf(fs_line);
}
