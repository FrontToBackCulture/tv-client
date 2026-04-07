export interface DataSource {
  id: string;
  domain: string;
  name: string;
  description: string | null;
  api_type: string;
  api_config: Record<string, any>;
  target_table: string;
  row_count: number;
  last_synced_at: string | null;
  sync_status: "never" | "running" | "success" | "error";
  sync_error: string | null;
  refresh_frequency: string;
  priority: number;
  data_type: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface IngestionLog {
  id: number;
  source_id: string;
  rows_upserted: number;
  rows_deleted: number;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  status: "running" | "success" | "error";
  error: string | null;
  metadata: Record<string, any>;
}

export interface IngestionResult {
  status: "success" | "error" | "skipped";
  rows?: number;
  duration_ms?: number;
  error?: string;
  reason?: string;
}

export const DOMAIN_LABELS: Record<string, string> = {
  fnb: "F&B",
  economy: "Economy",
  property: "Property",
  transport: "Transport",
  business: "Business",
  demographics: "Demographics",
};

export const DATA_TYPE_LABELS: Record<string, string> = {
  snapshot: "Snapshot",
  time_series_monthly: "Monthly",
  time_series_quarterly: "Quarterly",
  time_series_annual: "Annual",
  realtime: "Real-time",
};

export const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  never: { label: "Never synced", color: "zinc" },
  running: { label: "Syncing...", color: "blue" },
  success: { label: "Synced", color: "green" },
  error: { label: "Error", color: "red" },
};

export const PRIORITY_LABELS: Record<number, string> = {
  1: "P1",
  2: "P2",
  3: "P3",
};

// ─── MCF Job Postings ──────────────────────────────────

export interface McfJobPosting {
  id: string;
  mcf_uuid: string;
  title: string;
  description: string | null;
  company_name: string | null;
  company_uen: string | null;
  company_description: string | null;
  company_ssic_code: string | null;
  company_employee_count: string | null;
  company_url: string | null;
  company_logo: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_type: string | null;
  employment_types: string[] | null;
  position_levels: string[] | null;
  categories: string[] | null;
  minimum_years_experience: number | null;
  number_of_vacancies: number | null;
  job_status: string | null;
  new_posting_date: string | null;
  original_posting_date: string | null;
  expiry_date: string | null;
  job_details_url: string | null;
  ssoc_code: string | null;
  industry_tag: string | null;
  acra_ssic_code: string | null;
  acra_ssic_description: string | null;
  role_category: string | null;
  created_at: string | null;
}

// ─── Job Reviews ───────────────────────────────────────

export type ReviewStatus = "new" | "reviewing" | "researching" | "prospected" | "skipped";

export interface JobReview {
  id: string;
  mcf_uuid: string;
  status: ReviewStatus;
  priority: number | null;
  notes: string | null;
  tags: string[];
  crm_company_id: string | null;
  reviewed_by: string;
  reviewed_at: string;
  created_at: string;
  updated_at: string;
}

// ─── Saved Filters ─────────────────────────────────────

export interface JobFilters {
  search?: string;
  industry_tag?: string[];
  role_category?: string[];
  review_status?: ReviewStatus[];
  unreviewed_only?: boolean;
  salary_min?: number;
  company_employee_count?: string[];
}

export interface SavedFilter {
  id: string;
  source_table: string;
  name: string;
  filters: JobFilters;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ─── Label Maps ────────────────────────────────────────

export const INDUSTRY_TAG_OPTIONS: Record<string, string> = {
  fnb: "F&B",
  hospitality: "Hospitality",
  retail: "Retail",
  logistics: "Logistics",
  healthcare: "Healthcare",
  construction: "Construction",
  tech: "Tech",
  manufacturing: "Manufacturing",
  financial_services: "Financial Services",
  professional_services: "Professional Services",
  government: "Government",
  education: "Education",
  real_estate: "Real Estate",
  other: "Other",
};

export const ROLE_CATEGORY_OPTIONS: Record<string, string> = {
  executive: "Executive / Management",
  finance: "Finance / Accounting",
  admin: "Admin / Clerical",
  sales: "Sales / Marketing",
  it: "IT / Software",
  engineering: "Engineering / Science",
  healthcare: "Healthcare",
  teaching: "Education / Teaching",
  legal_social: "Legal / Social / Arts",
  technician: "Technician",
  services: "Services / Care",
  trades: "Trades / Craft",
  operators: "Operators / Drivers",
  elementary: "Elementary / Labour",
};

export const REVIEW_STATUS_CONFIG: Record<ReviewStatus, { label: string; color: string }> = {
  new: { label: "New", color: "blue" },
  reviewing: { label: "Reviewing", color: "amber" },
  researching: { label: "Researching", color: "purple" },
  prospected: { label: "Prospected", color: "teal" },
  skipped: { label: "Skipped", color: "zinc" },
};
