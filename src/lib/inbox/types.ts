// src/lib/inbox/types.ts
// Re-export types from useOutlook for backwards compatibility

export type {
  OutlookEmail as Email,
  OutlookStats,
  OutlookFolder as EmailFolder,
  OutlookAuthStatus,
  EmailAddress,
  EmailCategory,
  EmailStatus,
  EmailPriority,
} from "../../hooks/useOutlook";
