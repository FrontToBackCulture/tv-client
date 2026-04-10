// Email query keys

export const emailKeys = {
  all: ["email"] as const,
  contacts: () => [...emailKeys.all, "contacts"] as const,
  contact: (id: string) => [...emailKeys.contacts(), id] as const,
  contactsByGroup: (groupId: string) =>
    [...emailKeys.contacts(), "group", groupId] as const,
  groups: () => [...emailKeys.all, "groups"] as const,
  group: (id: string) => [...emailKeys.groups(), id] as const,
  campaigns: () => [...emailKeys.all, "campaigns"] as const,
  campaign: (id: string) => [...emailKeys.campaigns(), id] as const,
  campaignStats: (id: string) =>
    [...emailKeys.campaigns(), id, "stats"] as const,
  events: () => [...emailKeys.all, "events"] as const,
  eventsByCampaign: (campaignId: string) =>
    [...emailKeys.events(), "campaign", campaignId] as const,
  eventsByContact: (contactId: string) =>
    [...emailKeys.events(), "contact", contactId] as const,
  drafts: () => [...emailKeys.all, "drafts"] as const,
  draftsByContact: (contactId: string) => [...emailKeys.drafts(), "contact", contactId] as const,
  outreach: () => [...emailKeys.all, "outreach"] as const,
  outreachList: (status?: string) => [...emailKeys.outreach(), "list", status || "all"] as const,
};
