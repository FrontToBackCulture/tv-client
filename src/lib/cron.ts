// Shared cron description utilities

/** Calculate the next fire time for a 5-part cron expression. */
export function nextCronRun(expr: string, from?: Date): Date | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const [minPart, hourPart, , , dowPart] = parts;

  // Every N minutes case
  if (minPart.startsWith("*/")) {
    const interval = parseInt(minPart.slice(2));
    if (isNaN(interval) || interval <= 0) return null;
    const next = new Date(from ?? Date.now());
    const currentMin = next.getMinutes();
    const nextMin = Math.ceil((currentMin + 1) / interval) * interval;
    if (nextMin >= 60) {
      next.setHours(next.getHours() + 1, 0, 0, 0);
    } else {
      next.setMinutes(nextMin, 0, 0);
    }
    return next;
  }

  // Specific hour:minute case
  const hour = parseInt(hourPart);
  const minute = parseInt(minPart) || 0;
  if (isNaN(hour)) return null;

  // Parse allowed days of week
  let allowedDays: number[] | null = null;
  if (dowPart !== "*") {
    if (dowPart.includes("-")) {
      const [start, end] = dowPart.split("-").map(Number);
      if (!isNaN(start) && !isNaN(end)) {
        allowedDays = [];
        for (let d = start; d <= end; d++) allowedDays.push(d % 7);
      }
    } else if (dowPart.includes(",")) {
      allowedDays = dowPart.split(",").map(Number).filter((n) => !isNaN(n)).map((n) => n % 7);
    } else {
      const d = parseInt(dowPart);
      if (!isNaN(d)) allowedDays = [d % 7];
    }
  }

  const now = from ?? new Date();
  const candidate = new Date(now);
  candidate.setHours(hour, minute, 0, 0);

  // If today's fire time is in the past, start from tomorrow
  if (candidate <= now) candidate.setDate(candidate.getDate() + 1);

  // Search up to 8 days for a matching day-of-week
  for (let i = 0; i < 8; i++) {
    if (!allowedDays || allowedDays.includes(candidate.getDay())) {
      return candidate;
    }
    candidate.setDate(candidate.getDate() + 1);
  }

  return null;
}

/** Format a date as relative "next run" text (e.g., "Tomorrow 09:00", "2h from now") */
export function formatNextRun(date: Date | null): string {
  if (!date) return "—";

  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.round(diffMs / 60000);
  const diffHours = Math.round(diffMs / 3600000);

  if (diffMins < 60) return `${diffMins}m from now`;
  if (diffHours < 24) return `${diffHours}h from now`;

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  const time = date.toLocaleTimeString("en-SG", {
    timeZone: "Asia/Singapore",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  if (isTomorrow) return `Tomorrow ${time}`;

  const day = date.toLocaleDateString("en-SG", {
    timeZone: "Asia/Singapore",
    day: "numeric",
    month: "short",
  });
  return `${day} ${time}`;
}

export function describeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return `Cron: ${expr}`;

  const [min, hour, , , dow] = parts;

  const dowMap: Record<string, string> = {
    "0": "Sun", "1": "Mon", "2": "Tue", "3": "Wed", "4": "Thu", "5": "Fri", "6": "Sat", "7": "Sun",
    "1-5": "weekdays", "0-6": "every day", "*": "every day",
  };

  if (min.startsWith("*/")) return `Every ${min.slice(2)} minutes`;

  let schedule = "";
  if (hour === "*" && min === "0") {
    schedule = "Every hour";
  } else if (hour !== "*") {
    const h = parseInt(hour);
    const m = parseInt(min) || 0;
    const ampm = h >= 12 ? "pm" : "am";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    schedule = `At ${h12}:${m.toString().padStart(2, "0")}${ampm}`;
  } else {
    schedule = `At minute ${min}`;
  }

  if (dow !== "*") {
    schedule += `, ${dowMap[dow] ?? dow}`;
  } else {
    schedule += ", every day";
  }

  return schedule;
}

export function describeCronShort(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;

  const [min, hour, , , dow] = parts;

  if (min.startsWith("*/")) return `Every ${min.slice(2)}m`;
  if (hour === "*" && min === "0") return "Hourly";

  const h = parseInt(hour);
  const m = parseInt(min) || 0;
  if (isNaN(h)) return expr;

  const ampm = h >= 12 ? "p" : "a";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  let time = `${h12}:${m.toString().padStart(2, "0")}${ampm}`;

  const dowMap: Record<string, string> = {
    "1-5": "wkdays", "*": "daily", "0-6": "daily",
  };
  if (dow !== "*") time += ` ${dowMap[dow] ?? dow}`;
  else time += " daily";

  return time;
}
