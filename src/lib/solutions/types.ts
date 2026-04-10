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
  slug?: string;
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

export interface UploadedFileRecord {
  name: string;
  platform: string;
  driveFolder: string;
  uploadedAt: string;
}

export interface PersistedScanFile {
  name: string;
  path: string;
  size: number;
  format: string;
  headers: string[];
  match: { connector: string; platform: string; confidence: number } | null;
  dateRange: { from: string; to: string } | null;
  outlets: string[];
  outletDetails: { name: string; id: string }[];
}

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
  dropFolder?: string;
  uploadedFiles?: UploadedFileRecord[];
  lastScan?: { files: PersistedScanFile[]; scannedAt: string };
  outletMapping?: Record<string, string>; // data outlet name → scope outlet code
  dataLoadStatus?: Record<string, { status: string; triggeredAt: string }>; // "pm::Grab::Mar 2026" → status
  // AP-specific
  suppliers?: APSupplier[];
  supplierDocStatus?: Record<string, StatusEntry>;
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

// ============================================================================
// AP (Accounts Payable) types
// ============================================================================

export const AP_DOCUMENT_TYPES = [
  { key: "purchase_order", label: "Purchase Order" },
  { key: "delivery_order", label: "Delivery Order" },
  { key: "invoice", label: "Invoice" },
  { key: "statement_of_account", label: "Statement of Account" },
] as const;

export type APDocumentType = typeof AP_DOCUMENT_TYPES[number]["key"];

export const AP_RECON_TYPES = [
  { key: "do_vs_invoice", label: "DO vs Invoice" },
  { key: "invoice_vs_soa", label: "Invoice vs SOA" },
  { key: "po_vs_invoice", label: "PO vs Invoice" },
] as const;

export type APReconciliationType = typeof AP_RECON_TYPES[number]["key"];

export interface APSupplier {
  name: string;
  documentTypes: APDocumentType[];
  reconciliationTypes: APReconciliationType[];
  appliesTo: string; // "all" or specific outlets
  excludedOutlets: string[];
  notes: string;
}
