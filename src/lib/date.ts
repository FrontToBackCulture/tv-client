// Shared date formatting utilities
// All dates display in Singapore locale by default

const LOCALE = "en-SG";

/**
 * Format a date as "5 Jan" (no year) — for compact displays like task lists
 */
export function formatDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(LOCALE, { day: "numeric", month: "short" });
}

/**
 * Format a date as "5 Jan 2025" — for detail panels and metadata
 */
export function formatDateFull(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString(LOCALE, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

/**
 * Format a date relative to now — for inbox, activity feeds, conversations
 * Today: "10:30 AM" | Yesterday: "Yesterday" | <7 days: "Mon" | Older: "5 Jan"
 */
export function formatDateRelative(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" });
  } else if (diffDays === 1) {
    return "Yesterday";
  } else if (diffDays < 7) {
    return date.toLocaleDateString(LOCALE, { weekday: "short" });
  } else {
    return date.toLocaleDateString(LOCALE, { month: "short", day: "numeric" });
  }
}

/**
 * Format a date with "Today at" prefix — for activity timelines
 * Today: "Today at 3:45 PM" | Yesterday: "Yesterday" | <7 days: "Monday" | Older: "5 Jan 2025"
 */
export function formatDateActivity(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return `Today at ${date.toLocaleTimeString(LOCALE, { hour: "numeric", minute: "2-digit" })}`;
  } else if (diffDays === 1) {
    return "Yesterday";
  } else if (diffDays < 7) {
    return date.toLocaleDateString(LOCALE, { weekday: "long" });
  } else {
    return date.toLocaleDateString(LOCALE, { month: "short", day: "numeric", year: "numeric" });
  }
}

/**
 * Compact relative time — "today", "1d", "3d", "2w", "5mo", "1y"
 */
export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "1d";
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

/**
 * Verbose relative time — "just now", "5m ago", "3h ago", "2d ago", then date
 */
export function timeAgoVerbose(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString(LOCALE);
}

/**
 * Short relative time for conversations — "now", "5m", "3h", "2d"
 */
export function timeAgoCompact(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/**
 * Number of whole days since a date
 */
export function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

/**
 * Whether a due date is before today (midnight comparison)
 */
export function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date(new Date().toDateString());
}
