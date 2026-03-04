// Drive file inspection — download files from S3, parse XLSX/CSV, detect business date ranges

import { invoke } from "@tauri-apps/api/core";
import * as XLSX from "xlsx";

// ============================
// Types
// ============================

export interface FileInspectResult {
  fileName: string;
  fileType: "xlsx" | "csv" | "unknown";
  minDate: string | null; // ISO "2026-01-01"
  maxDate: string | null;
  dateColumn: string | null; // column header name
  rowCount: number;
  sampleDates: string[]; // up to 5
  displayRange: string | null; // "Jan 2026" or "2026-02-04 to 2026-02-28"
  status: "success" | "no-dates" | "error";
  error?: string;
}

// ============================
// Date detection patterns
// ============================

const DATE_HEADER_PATTERNS = [
  /\bdate\b/i,
  /\bperiod\b/i,
  /\bmonth\b/i,
  /\bbusiness.?date\b/i,
  /\btransaction.?date\b/i,
  /\breport.?date\b/i,
  /\bsettlement.?date\b/i,
  /\bcreated\b/i,
  /\border.?date\b/i,
  /\bposting.?date\b/i,
  /\bvalue.?date\b/i,
  /\beffective.?date\b/i,
];

// Parse various date formats into a Date object, returns null if not a date
function tryParseDate(val: unknown): Date | null {
  if (val == null) return null;

  // Excel serial number (numbers in the 40000-50000 range)
  if (typeof val === "number") {
    if (val >= 30000 && val <= 55000) {
      // Excel epoch: Jan 0, 1900 (with the 1900 leap year bug)
      const d = new Date((val - 25569) * 86400000);
      if (!isNaN(d.getTime())) return d;
    }
    return null;
  }

  if (typeof val !== "string") return null;
  const s = val.trim();
  if (s.length < 6 || s.length > 25) return null;

  // YYYYMMDD
  if (/^\d{8}$/.test(s)) {
    const d = new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`);
    if (!isNaN(d.getTime())) return d;
  }

  // YYYY-MM-DD or YYYY/MM/DD
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(s)) {
    const d = new Date(s.replace(/\//g, "-").slice(0, 10));
    if (!isNaN(d.getTime())) return d;
  }

  // DD/MM/YYYY or D/M/YYYY
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (dmy) {
    const [, day, month, year] = dmy;
    const d = new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
    if (!isNaN(d.getTime()) && d.getFullYear() >= 2000 && d.getFullYear() <= 2040) return d;
  }

  return null;
}

function isDateHeader(header: string): boolean {
  return DATE_HEADER_PATTERNS.some((p) => p.test(header));
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ============================
// Display range formatting
// ============================

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function buildDisplayRange(minDate: Date, maxDate: Date): string {
  const minY = minDate.getFullYear();
  const minM = minDate.getMonth();
  const maxY = maxDate.getFullYear();
  const maxM = maxDate.getMonth();

  // Same day
  if (toISODate(minDate) === toISODate(maxDate)) {
    return toISODate(minDate);
  }

  // Same month
  if (minY === maxY && minM === maxM) {
    // Check if it spans most of the month (>= 20 days)
    const diffDays = (maxDate.getTime() - minDate.getTime()) / 86400000;
    if (diffDays >= 20) {
      return `${MONTH_NAMES[minM]} ${minY}`;
    }
    return `${toISODate(minDate)} to ${toISODate(maxDate)}`;
  }

  // Cross month, same year
  if (minY === maxY) {
    return `${MONTH_NAMES[minM]} - ${MONTH_NAMES[maxM]} ${maxY}`;
  }

  // Cross year
  return `${MONTH_NAMES[minM]} ${minY} - ${MONTH_NAMES[maxM]} ${maxY}`;
}

// ============================
// File type detection
// ============================

function getFileType(fileName: string): "xlsx" | "csv" | "unknown" {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "xlsx" || ext === "xls") return "xlsx";
  if (ext === "csv" || ext === "txt") return "csv";
  return "unknown";
}

// ============================
// Parse rows from XLSX or CSV
// ============================

function parseXlsx(buffer: Uint8Array): { headers: string[]; rows: Record<string, unknown>[] } {
  const wb = XLSX.read(buffer, { type: "array", sheetRows: 500 });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { headers, rows };
}

function parseCsv(text: string): { headers: string[]; rows: Record<string, unknown>[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };

  // Detect delimiter (comma vs tab vs semicolon)
  const firstLine = lines[0];
  const delim = firstLine.includes("\t") ? "\t" : firstLine.includes(";") ? ";" : ",";

  const headers = firstLine.split(delim).map((h) => h.replace(/^["']|["']$/g, "").trim());
  const rows: Record<string, unknown>[] = [];

  for (let i = 1; i < Math.min(lines.length, 500); i++) {
    const vals = lines[i].split(delim);
    const row: Record<string, unknown> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = vals[j]?.replace(/^["']|["']$/g, "").trim() ?? null;
    }
    rows.push(row);
  }

  return { headers, rows };
}

// ============================
// Date column detection
// ============================

function detectDateColumn(
  headers: string[],
  rows: Record<string, unknown>[]
): { column: string; dates: Date[] } | null {
  // Score each column: header match bonus + count of valid date values
  const candidates: { column: string; headerMatch: boolean; dates: Date[] }[] = [];

  for (const col of headers) {
    const headerMatch = isDateHeader(col);
    const dates: Date[] = [];

    for (const row of rows) {
      const d = tryParseDate(row[col]);
      if (d) dates.push(d);
    }

    if (dates.length > 0 || headerMatch) {
      candidates.push({ column: col, headerMatch, dates });
    }
  }

  if (candidates.length === 0) return null;

  // Sort: prefer header match, then most date values
  candidates.sort((a, b) => {
    if (a.headerMatch !== b.headerMatch) return a.headerMatch ? -1 : 1;
    return b.dates.length - a.dates.length;
  });

  const best = candidates[0];
  if (best.dates.length === 0) return null;

  return { column: best.column, dates: best.dates };
}

// ============================
// Main inspect function
// ============================

/**
 * Inspect a Drive file for date ranges.
 * @param domain - e.g. "ca"
 * @param fileKey - full S3 sub-key under the domain, e.g. "val_drive/RevRec/01_SourceReports/file.xlsx"
 * @param fileName - just the file name for display, e.g. "file.xlsx"
 */
export async function inspectDriveFile(
  domain: string,
  fileKey: string,
  fileName: string
): Promise<FileInspectResult> {
  const fileType = getFileType(fileName);

  if (fileType === "unknown") {
    return {
      fileName,
      fileType,
      minDate: null,
      maxDate: null,
      dateColumn: null,
      rowCount: 0,
      sampleDates: [],
      displayRange: null,
      status: "no-dates",
    };
  }

  try {
    // Download from S3 (limit CSV to 50KB, XLSX needs full file)
    const maxBytes = fileType === "csv" ? 51200 : undefined;
    const base64: string = await invoke("val_drive_download_file", {
      domain,
      fileKey,
      maxBytes,
    });

    // Decode base64 to bytes
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    // Parse
    let headers: string[];
    let rows: Record<string, unknown>[];

    if (fileType === "xlsx") {
      const parsed = parseXlsx(bytes);
      headers = parsed.headers;
      rows = parsed.rows;
    } else {
      const text = new TextDecoder("utf-8").decode(bytes);
      const parsed = parseCsv(text);
      headers = parsed.headers;
      rows = parsed.rows;
    }

    // Detect dates
    const detection = detectDateColumn(headers, rows);

    if (!detection) {
      return {
        fileName,
        fileType,
        minDate: null,
        maxDate: null,
        dateColumn: null,
        rowCount: rows.length,
        sampleDates: [],
        displayRange: null,
        status: "no-dates",
      };
    }

    const { column, dates } = detection;
    const sorted = dates.sort((a, b) => a.getTime() - b.getTime());
    const minDate = sorted[0];
    const maxDate = sorted[sorted.length - 1];

    // Sample up to 5 unique dates
    const uniqueDates = [...new Set(sorted.map(toISODate))];
    const sampleDates = uniqueDates.slice(0, 5);

    return {
      fileName,
      fileType,
      minDate: toISODate(minDate),
      maxDate: toISODate(maxDate),
      dateColumn: column,
      rowCount: rows.length,
      sampleDates,
      displayRange: buildDisplayRange(minDate, maxDate),
      status: "success",
    };
  } catch (e) {
    return {
      fileName,
      fileType,
      minDate: null,
      maxDate: null,
      dateColumn: null,
      rowCount: 0,
      sampleDates: [],
      displayRange: null,
      status: "error",
      error: String(e),
    };
  }
}

// ============================
// Cache key helper
// ============================

export function inspectCacheKey(
  domain: string,
  fileKey: string,
  lastModified: string | null
): string {
  return `${domain}::${fileKey}::${lastModified ?? "unknown"}`;
}

// ============================
// Inspectable file check
// ============================

export function isInspectable(fileName: string): boolean {
  return getFileType(fileName) !== "unknown";
}
