// Portal query keys

import type { ConversationFilters } from "../../lib/portal/types";

export const portalKeys = {
  all: ["portal"] as const,
  sites: () => [...portalKeys.all, "sites"] as const,
  conversations: () => [...portalKeys.all, "conversations"] as const,
  conversationsByFilter: (filters: ConversationFilters) =>
    [...portalKeys.conversations(), filters] as const,
  conversation: (id: string) => [...portalKeys.conversations(), id] as const,
  messages: (conversationId: string) =>
    [...portalKeys.all, "messages", conversationId] as const,
  banners: () => [...portalKeys.all, "banners"] as const,
  popups: () => [...portalKeys.all, "popups"] as const,
  changelog: () => [...portalKeys.all, "changelog"] as const,
  docs: () => [...portalKeys.all, "docs"] as const,
};
