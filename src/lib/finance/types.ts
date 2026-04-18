// Types for the Finance module — mirrors the QBO schema in the mgmt workspace.

export interface QboConnection {
  id: string;
  realm_id: string;
  company_name: string | null;
  expires_at: string;
  environment: "production" | "sandbox";
  status: "active" | "needs_reauth" | "disabled";
  last_error: string | null;
  created_at: string;
  updated_at: string;
  // access_token / refresh_token are service-role only and never reach the client.
}

export interface QboSyncRun {
  id: string;
  entity_type: string;
  started_at: string;
  completed_at: string | null;
  status: "running" | "ok" | "failed";
  records_processed: number | null;
  error: string | null;
  cursor: string | null;
  triggered_by: string | null;
}

export type QboEntity =
  | "accounts"
  | "customers"
  | "vendors"
  | "items"
  | "classes"
  | "estimates"
  | "invoices"
  | "bills"
  | "payments"
  | "bill_payments"
  | "expenses"
  | "journal_entries"
  | "all";
