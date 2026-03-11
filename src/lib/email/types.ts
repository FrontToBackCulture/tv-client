// Email module types for tv-client
import type { Database } from "../supabase-types";

// Base types from database
export type EmailContact =
  Database["public"]["Tables"]["email_contacts"]["Row"];
export type EmailContactInsert =
  Database["public"]["Tables"]["email_contacts"]["Insert"];
export type EmailContactUpdate =
  Database["public"]["Tables"]["email_contacts"]["Update"];

export type EmailGroup = Database["public"]["Tables"]["email_groups"]["Row"];
export type EmailGroupInsert =
  Database["public"]["Tables"]["email_groups"]["Insert"];
export type EmailGroupUpdate =
  Database["public"]["Tables"]["email_groups"]["Update"];

export type EmailContactGroup =
  Database["public"]["Tables"]["email_contact_groups"]["Row"];

export type EmailCampaign =
  Database["public"]["Tables"]["email_campaigns"]["Row"];
export type EmailCampaignInsert =
  Database["public"]["Tables"]["email_campaigns"]["Insert"];
export type EmailCampaignUpdate =
  Database["public"]["Tables"]["email_campaigns"]["Update"];

export type EmailEvent = Database["public"]["Tables"]["email_events"]["Row"];
export type EmailEventInsert =
  Database["public"]["Tables"]["email_events"]["Insert"];

// Extended types with relations
export interface EmailContactWithGroups extends EmailContact {
  groups?: EmailGroup[];
}

export interface EmailGroupWithCount extends EmailGroup {
  memberCount?: number;
  contacts?: EmailContact[];
}

export interface EmailCampaignWithStats extends EmailCampaign {
  group?: EmailGroup;
  recipientCount?: number;
  stats?: CampaignStats;
}

export interface CampaignStats {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  unsubscribed: number;
  openRate: number;
  clickRate: number;
}

// Filter types
export interface EmailContactFilters {
  status?: EmailContact["status"] | EmailContact["status"][];
  groupId?: string;
  search?: string;
}

export interface EmailCampaignFilters {
  status?: EmailCampaign["status"] | EmailCampaign["status"][];
  groupId?: string;
  search?: string;
}

// CSV import types
export interface ImportRow {
  email: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  domain?: string;
  group?: string;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: number;
  errorDetails: string[];
  groupsCreated: string[];
}

// Constants for UI
export const CONTACT_STATUSES = [
  { value: "active" as const, label: "Active", color: "green" },
  { value: "unsubscribed" as const, label: "Unsubscribed", color: "gray" },
  { value: "bounced" as const, label: "Bounced", color: "red" },
];

export const CAMPAIGN_STATUSES = [
  { value: "draft" as const, label: "Draft", color: "gray" },
  { value: "scheduled" as const, label: "Scheduled", color: "blue" },
  { value: "sending" as const, label: "Sending", color: "yellow" },
  { value: "sent" as const, label: "Sent", color: "green" },
  { value: "partial" as const, label: "Partial", color: "orange" },
  { value: "failed" as const, label: "Failed", color: "red" },
];

export const EVENT_TYPES = [
  { value: "sent" as const, label: "Sent", icon: "send" },
  { value: "delivered" as const, label: "Delivered", icon: "check" },
  { value: "opened" as const, label: "Opened", icon: "eye" },
  { value: "clicked" as const, label: "Clicked", icon: "mouse-pointer" },
  { value: "bounced" as const, label: "Bounced", icon: "alert-triangle" },
  { value: "complained" as const, label: "Complained", icon: "flag" },
  { value: "unsubscribed" as const, label: "Unsubscribed", icon: "user-minus" },
];
