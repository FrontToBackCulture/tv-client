// Solution onboarding types

// ============================================================================
// Database row types (manually defined — add to supabase-types.ts after migration)
// ============================================================================

export interface SolutionTemplate {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  version: number;
  status: "draft" | "published" | "archived";
  template: TemplateDefinition;
  example_data: InstanceData | null;
  product_solution_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SolutionInstance {
  id: string;
  domain: string;
  template_id: string;
  template_version: number;
  data: InstanceData;
  total_items: number;
  completed_items: number;
  progress_pct: number;
  status: "active" | "paused" | "completed";
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SolutionInstanceWithTemplate extends SolutionInstance {
  template: SolutionTemplate;
}

// ============================================================================
// Template definition — stored as JSONB in solution_templates.template
// ============================================================================

export interface TemplateDefinition {
  tabs: TemplateTab[];
  credentialPlatforms?: string[];
  settlementExclude?: string[];
}

export interface TemplateTab {
  key: string;
  label: string;
  color: string;
  sections: TemplateSection[];
}

export interface TemplateSection {
  key: string;
  label: string;
  type: string;
}

// ============================================================================
// Instance data — stored as JSONB in solution_instances.data
// ============================================================================

export interface InstanceData {
  scope?: ScopeOutlet[];
  paymentMethods?: PaymentMethod[];
  banks?: BankAccount[];
  periods?: string[];
  posStatus?: Record<string, StatusEntry>;
  credStatus?: Record<string, StatusEntry>;
  docStatus?: Record<string, StatusEntry>;
  posLabels?: Record<string, string>;
  outletMap?: Record<string, string>;
  implStatus?: Record<string, ImplStatusEntry>;
}

export interface ScopeOutlet {
  entity: string;
  outlet: string;
  pos: string[];   // multiple POS systems per outlet
  notes: string;
}

export const PAYMENT_METHOD_OPTIONS = [
  "Adyen", "Adyen_Ecom", "Aigens", "Alipay", "AMEX",
  "CapitaLand Voucher", "Cash", "CDC Voucher",
  "DBS CC", "Deliveroo",
  "Fave Pay", "FOMO Pay", "Food Panda",
  "Getz Pay", "Grab", "GrabFinance", "GrabFood", "GrabMart", "GrabPay",
  "Hillion Mall Voucher", "HPB Voucher",
  "Liquid Pay",
  "NETS", "NETS CC", "NinjaOS",
  "OCBC CC", "Oddle",
  "Paynow", "Paynow Static",
  "Shopback Pay", "Shopee Pay", "SmartPay", "Stripe",
  "Suntec Voucher",
  "UOB CC",
] as const;

export const BANK_OPTIONS = ["DBS", "OCBC", "UOB"] as const;

export const POS_OPTIONS = [
  "Aptsys", "Atlas", "AZ Digital", "CAG Epoint", "CAG Raptor",
  "Dine", "Epoint", "FnBees", "Getz Sales", "iMakan",
  "Megapos", "Novitee", "Oracle", "Raptor", "Revel",
  "Suntoyo", "Vivipos", "Xilnex",
] as const;

export interface PaymentMethod {
  name: string;
  appliesTo: string;
  excludedOutlets: string[];
  notes: string;
}

export interface BankAccount {
  bank: string;
  account: string;
  outlets: string[];
  paymentMethods: string[];
  notes: string;
}

export interface StatusEntry {
  status: ItemStatus;
  detail: string;
}

export interface ImplStatusEntry {
  status: ItemStatus;
  detail: string;
  date?: string;
  minDate?: string;
  maxDate?: string;
}

export type ItemStatus = "pending" | "progress" | "blocked" | "done" | "na";

// ============================================================================
// Derived helpers (computed from scope, not stored)
// ============================================================================

export interface OutletInfo {
  key: string;
  entity: string;
  label: string;
}

export interface UniquePOS {
  name: string;
  outlets: string[];
}

export interface SyncItem {
  type: "POS" | "Payment" | "Bank" | "Recon";
  name: string;
  scope: string;
  key: string;
}
