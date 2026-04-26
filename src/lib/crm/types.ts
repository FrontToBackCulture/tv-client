// CRM module types for tv-client
import type { Database } from "../supabase-types";

// Base types from database
export type Company = Database["public"]["Tables"]["crm_companies"]["Row"];
export type CompanyInsert =
  Database["public"]["Tables"]["crm_companies"]["Insert"];
export type CompanyUpdate =
  Database["public"]["Tables"]["crm_companies"]["Update"];

export type Contact = Database["public"]["Tables"]["crm_contacts"]["Row"];
export type ContactInsert =
  Database["public"]["Tables"]["crm_contacts"]["Insert"];
export type ContactUpdate =
  Database["public"]["Tables"]["crm_contacts"]["Update"];

// Deals are stored in the projects table — this is the mapped legacy shape
export interface Deal {
  id: string;
  name: string;
  description: string | null;
  company_id: string;
  stage: string | null;
  solution: string | null;
  value: number | null;
  currency: string | null;
  expected_close_date: string | null;
  actual_close_date?: string | null;
  lost_reason?: string | null;
  won_notes?: string | null;
  proposal_path?: string | null;
  order_form_path?: string | null;
  contact_ids?: string[] | null;
  notes: string | null;
  tags?: string[] | null;
  stage_changed_at?: string | null;
  stale_snoozed_until?: string | null;
  created_at: string | null;
  updated_at?: string | null;
}
export type DealInsert = Partial<Deal> & { name: string; company_id: string };
export type DealUpdate = Partial<Deal>;

export type Activity = Database["public"]["Tables"]["crm_activities"]["Row"];
export type ActivityInsert =
  Database["public"]["Tables"]["crm_activities"]["Insert"];

export type EmailCompanyLink =
  Database["public"]["Tables"]["crm_email_company_links"]["Row"];

// Deal with task info (for company views)
export interface DealWithTaskInfo extends Deal {
  company?: { name: string; referred_by?: string | null };
  tasks?: DealTask[];
  openTaskCount?: number;
  nextTask?: { title: string; due_date: string | null } | null;
}

// Extended types with relations
export interface CompanyWithRelations extends Company {
  contacts?: Contact[];
  deals?: DealWithTaskInfo[];
  activities?: Activity[];
  primaryContact?: Contact | null;
  activeDealCount?: number;
  totalDealValue?: number;
  lastActivityDate?: string;
}

export interface ContactWithRelations extends Contact {
  company?: Company;
}

// Minimal task type for CRM display (avoids circular import)
export interface DealTask {
  id: string;
  title: string;
  status_type: string;
  priority: number;
  due_date: string | null;
  assignee_name?: string | null;
}

export interface DealWithRelations extends Deal {
  company?: Company;
  contacts?: Contact[];
  tasks?: DealTask[];
  openTaskCount?: number;
  nextTask?: { title: string; due_date: string | null } | null;
}

export interface ActivityWithRelations extends Activity {
  company?: Company;
  contact?: Contact | null;
  deal?: Deal | null;
}

// Filter types
export interface CompanyFilters {
  stage?: Company["stage"] | Company["stage"][];
  industry?: string;
  search?: string;
  hasActiveDeals?: boolean;
  tags?: string[];
}

export interface ContactFilters {
  companyId?: string;
  search?: string;
  isActive?: boolean;
}

export interface DealFilters {
  companyId?: string;
  stage?: Deal["stage"] | Deal["stage"][];
  minValue?: number;
  maxValue?: number;
  expectedCloseBefore?: string;
  expectedCloseAfter?: string;
}

export interface ActivityFilters {
  companyId?: string;
  dealId?: string;
  projectId?: string;
  taskId?: string;
  contactId?: string;
  type?: Activity["type"] | Activity["type"][];
  afterDate?: string;
  beforeDate?: string;
  limit?: number;
}

// Stage definitions for UI
export const COMPANY_STAGES = [
  { value: "prospect" as const, label: "Prospect", color: "gray" },
  { value: "opportunity" as const, label: "Opportunity", color: "blue" },
  { value: "client" as const, label: "Client", color: "green" },
  { value: "churned" as const, label: "Churned", color: "red" },
  { value: "partner" as const, label: "Partner", color: "purple" },
];

export const DEAL_STAGES = [
  { value: "target" as const, label: "Target", color: "zinc", weight: 0.05 },
  { value: "prospect" as const, label: "Prospect", color: "zinc", weight: 0.1 },
  { value: "lead" as const, label: "Lead", color: "gray", weight: 0.2 },
  { value: "qualified" as const, label: "Qualified", color: "blue", weight: 0.3 },
  { value: "pilot" as const, label: "Pilot", color: "purple", weight: 0.5 },
  { value: "proposal" as const, label: "Proposal", color: "cyan", weight: 0.6 },
  { value: "negotiation" as const, label: "Negotiation", color: "yellow", weight: 0.8 },
  { value: "won" as const, label: "Won", color: "green", weight: 1.0 },
  { value: "lost" as const, label: "Lost", color: "red", weight: 0 },
];

export const DEAL_SOLUTIONS = [
  {
    value: "ap_automation" as const,
    label: "AP Automation",
    color: "blue",
    icon: "receipt",
  },
  {
    value: "ar_automation" as const,
    label: "AR Automation",
    color: "indigo",
    icon: "receipt",
  },
  {
    value: "free_invoice_scan" as const,
    label: "Free Invoice Scan",
    color: "green",
    icon: "scan",
  },
  {
    value: "analytics" as const,
    label: "Analytics",
    color: "purple",
    icon: "chart",
  },
  {
    value: "revenue_reconciliation" as const,
    label: "Revenue Reconciliation",
    color: "cyan",
    icon: "calculator",
  },
  {
    value: "professional_services" as const,
    label: "Professional Services",
    color: "amber",
    icon: "briefcase",
  },
  {
    value: "partnership" as const,
    label: "Partnership",
    color: "rose",
    icon: "handshake",
  },
  {
    value: "data_extraction" as const,
    label: "Data Extraction",
    color: "orange",
    icon: "file-search",
  },
  {
    value: "events_ai" as const,
    label: "Events AI",
    color: "pink",
    icon: "calendar-days",
  },
  {
    value: "byoai" as const,
    label: "BYOAI",
    color: "emerald",
    icon: "sparkles",
  },
  {
    value: "general" as const,
    label: "General",
    color: "gray",
    icon: "folder-open",
  },
  { value: "other" as const, label: "Other", color: "zinc", icon: "folder" },
];

export const ACTIVITY_TYPES = [
  { value: "email" as const, label: "Email", icon: "mail" },
  { value: "note" as const, label: "Note", icon: "file-text" },
  { value: "meeting" as const, label: "Meeting", icon: "calendar" },
  { value: "call" as const, label: "Call", icon: "phone" },
  { value: "task" as const, label: "Task", icon: "check-square" },
  { value: "stage_change" as const, label: "Stage Change", icon: "git-branch" },
];

export const COMPANY_SOURCES = [
  { value: "apollo" as const, label: "Apollo" },
  { value: "inbound" as const, label: "Inbound" },
  { value: "referral" as const, label: "Referral" },
  { value: "manual" as const, label: "Manual" },
  { value: "existing" as const, label: "Existing" },
];

// Pipeline stats type
export interface PipelineStats {
  byStage: { stage: string; count: number; value: number }[];
  totalValue: number;
  totalDeals: number;
}
