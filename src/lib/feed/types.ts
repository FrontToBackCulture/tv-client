// Feed module types

export type CardType =
  | "feature"
  | "tip"
  | "team"
  | "skill"
  | "platform"
  | "release"
  | "module"
  | "app_tip";

export type CardCategory = "event" | "knowledge";

export interface FeedCard {
  id: string;
  card_type: CardType;
  category: CardCategory;
  badge: string;
  title: string;
  body: string;
  source: string;
  source_detail: string | null;
  triggers: string[] | null;
  chips: string[] | null;
  stats: { label: string; value: string }[] | null;
  features: string[] | null;
  author: { initials: string; name: string; role: string } | null;
  cta_label: string | null;
  cta_action: string | null;
  scheduled_date: string | null;
  pinned: boolean;
  archived: boolean;
  created_by: string | null;
  source_ref: string | null;
  visual: string | null;
  series_id: string | null;
  series_order: number;
  created_at: string;
  updated_at: string;
}

export interface FeedInteraction {
  id: string;
  card_id: string;
  user_id: string;
  seen: boolean;
  liked: boolean;
  saved: boolean;
  seen_at: string | null;
  liked_at: string | null;
  saved_at: string | null;
}

export interface FeedCardWithInteraction extends FeedCard {
  interaction?: FeedInteraction | null;
}
