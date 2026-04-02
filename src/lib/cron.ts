// Shared cron description utilities

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
