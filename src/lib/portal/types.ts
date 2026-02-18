// Portal module types

export interface PortalSite {
  id: string;
  slug: string;
  name: string;
  base_url: string | null;
  company_id: string | null;
  domain_id: string | null;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  site_id: string;
  customer_name: string | null;
  customer_email: string | null;
  status: "active" | "waiting" | "resolved" | "closed";
  assigned_to: string | null;
  metadata: Record<string, unknown>;
  incident_id: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  // Joined
  site?: PortalSite;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_type: "customer" | "agent" | "system";
  sender_id: string | null;
  sender_name: string | null;
  content: string;
  content_type: "text" | "image" | "file" | "internal_note";
  attachments: unknown[];
  created_at: string;
}

export interface Banner {
  id: string;
  title: string;
  content: string;
  type: "info" | "warning" | "maintenance" | "announcement";
  bg_color: string | null;
  text_color: string | null;
  cta_text: string | null;
  cta_url: string | null;
  dismissible: boolean;
  auto_dismiss_seconds: number | null;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  target_sites: string[];
  created_at: string;
  updated_at: string;
}

export interface Popup {
  id: string;
  title: string;
  body: string;
  image_url: string | null;
  cta_text: string | null;
  cta_url: string | null;
  trigger_type: "page_load" | "delay" | "scroll_percent";
  trigger_value: string | null;
  frequency: "once" | "every_session" | "every_x_days";
  frequency_days: number | null;
  url_pattern: string | null;
  is_active: boolean;
  target_sites: string[];
  created_at: string;
  updated_at: string;
}

export interface ChangelogEntry {
  id: string;
  title: string;
  body: string;
  category: "feature" | "improvement" | "fix" | "announcement";
  is_published: boolean;
  published_at: string | null;
  target_sites: string[];
  created_at: string;
  updated_at: string;
}

export interface PortalDoc {
  id: string;
  title: string;
  summary: string | null;
  content: string;
  category: string | null;
  doc_type: string | null;
  tags: string[];
  is_widget_visible: boolean;
  view_count: number;
  sort_order: number;
  target_sites: string[];
  created_at: string;
  updated_at: string;
}

export type PortalView = "conversations" | "incidents" | "announcements" | "help";

export type AnnouncementTab = "banners" | "changelog" | "popups";

export interface ConversationFilters {
  site_id?: string;
  status?: string;
  search?: string;
}
