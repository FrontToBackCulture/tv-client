// Shared date formatting utilities
// All dates display in Singapore locale and timezone by default

const LOCALE = "en-SG";
const SGT_TZ = "Asia/Singapore";

/**
 * Format a Date or epoch (seconds) as a locale string in SGT
 * e.g. "24 Mar 2026, 3:45:00 pm"
 */
export function formatDateTimeSGT(date: Date | number): string {
  const d = typeof date === "number" ? new Date(date * 1000) : date;
  return d.toLocaleString(LOCALE, { timeZone: SGT_TZ });
}

/**
 * Get today's date as YYYY-MM-DD in SGT (safe across all machine timezones)
 */
export function toSGTDateString(date: Date = new Date()): string {
  return date.toLocaleDateString("en-CA", { timeZone: SGT_TZ }); // en-CA gives YYYY-MM-DD
}

/**
 * Get start of today (midnight) in SGT as a UTC timestamp for comparisons
 */
export function sgtMidnightToday(): number {
  const sgtDate = toSGTDateString();
  // Parse YYYY-MM-DD as SGT midnight → convert to UTC ms
  const [y, m, d] = sgtDate.split("-").map(Number);
  return Date.UTC(y, m - 1, d) - 8 * 60 * 60 * 1000; // SGT = UTC+8
}

/**
 * General-purpose date format — "5 Jan 2025"
 * Used by email module and as a default when no specific format is needed.
 */
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(LOCALE, { year: "numeric", month: "short", day: "numeric" });
}

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
 * Whether a due date is before today (midnight SGT comparison)
 */
export function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  const todaySGT = toSGTDateString();
  return dueDate.slice(0, 10) < todaySGT;
}
