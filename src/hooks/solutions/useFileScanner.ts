import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { readFile } from "@tauri-apps/plugin-fs";
import * as XLSX from "xlsx";

// ─── Types ───

interface ConnectorFingerprint {
  platform: string;
  headers: string[];
  format: string;
}

export interface ScannedFile {
  name: string;
  path: string;
  size: number;
  format: string;
  headers: string[];
  match: {
    connector: string;
    platform: string;
    confidence: number; // 0-1
  } | null;
  dateRange: { from: string; to: string } | null;
  outlets: string[];
  outletDetails: { name: string; id: string }[];
  usedOutletColumn: string | null;
  usedDateColumn: string | null;
  candidateOutletColumns: string[];
  candidateDateColumns: string[];
}

export type ScanBindings = Record<string, { outlet?: string; date?: string }>;

export interface ScanResult {
  files: ScannedFile[];
  scannedAt: string;
}

// ─── Fingerprint matching ───

function scoreMatch(fileHeaders: string[], fpHeaders: string[]): number {
  if (fileHeaders.length === 0 || fpHeaders.length === 0) return 0;

  const fileSet = new Set(fileHeaders);
  const fpSet = new Set(fpHeaders);

  // Count how many fingerprint headers appear in the file
  let matched = 0;
  for (const h of fpSet) {
    if (fileSet.has(h)) matched++;
  }

  // Score = proportion of fingerprint headers found in file
  // Use fingerprint size as denominator (not file headers — file may have extra cols)
  return matched / fpSet.size;
}

function findBestMatch(
  fileHeaders: string[],
  fingerprints: Record<string, ConnectorFingerprint>,
): { connector: string; platform: string; confidence: number } | null {
  let best: { connector: string; platform: string; confidence: number } | null = null;

  for (const [connector, fp] of Object.entries(fingerprints)) {
    const score = scoreMatch(fileHeaders, fp.headers);
    if (score > 0.5 && (!best || score > best.confidence)) {
      best = { connector, platform: fp.platform, confidence: score };
    }
  }

  return best;
}

// ─── Date extraction ───

function tryParseDate(val: any): Date | null {
  if (!val) return null;

  // Excel serial number (e.g., 45658 = 2024-12-31)
  if (typeof val === "number" && val > 40000 && val < 55000) {
    const d = new Date((val - 25569) * 86400000);
    if (!isNaN(d.getTime())) return d;
  }

  const str = String(val).trim();
  if (!str || str.length < 6) return null;

  // Try direct Date parse first (handles ISO, common formats)
  const direct = new Date(str);
  if (!isNaN(direct.getTime()) && direct.getFullYear() >= 2020 && direct.getFullYear() <= 2030) {
    return direct;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmy) {
    const d = new Date(`${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`);
    if (!isNaN(d.getTime()) && d.getFullYear() >= 2020) return d;
  }

  // YYYYMMDD
  const ymd = str.match(/^(20\d{2})(\d{2})(\d{2})$/);
  if (ymd) {
    const d = new Date(`${ymd[1]}-${ymd[2]}-${ymd[3]}`);
    if (!isNaN(d.getTime())) return d;
  }

  // Extract date from longer strings (e.g., "2025-07-01 12:30:00")
  const embedded = str.match(/(20\d{2}-\d{2}-\d{2})/);
  if (embedded) {
    const d = new Date(embedded[1]);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

interface DateRangeResult {
  range: { from: string; to: string } | null;
  usedColumn: string | null;
  candidates: string[];
}

// Keep in sync with autoDetectDateColumn in SolutionOnboardingPanel.tsx.
// Deliberately excludes short/greedy tokens (`to`, `from`, `end`, `start`,
// `day`, `month`, `transaction`, `order`) that produced false positives like
// `store name → to`, `order id → order`, `subtotal → to`.
const DATE_INCLUDE_RX = /date|timestamp|time|created|updated|posted|posting|settled|settlement|payout|processed|effective/i;
const DATE_PREFERRED_RX = /date|timestamp|\btime\b|_time\b|time_/i;
const DATE_EXCLUDE_RX = /\b(amount|value|fee|total|sum|currency|price|rate|reference|id|number|mdr)\b|id$|_id/i;

function extractDateRange(
  rows: any[],
  headers: string[],
  override?: string | null,
): DateRangeResult {
  // Preferred: explicit `date`/`time` mentions without currency/id tokens.
  // Fallback: broader verb-form matches (created, updated, etc).
  const preferred = headers.filter((h) => DATE_PREFERRED_RX.test(h) && !DATE_EXCLUDE_RX.test(h));
  const fallback = headers.filter((h) => DATE_INCLUDE_RX.test(h) && !DATE_EXCLUDE_RX.test(h) && !preferred.includes(h));
  const candidates = [...preferred, ...fallback];

  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  // Explicit override — use only that column.
  if (override && headers.includes(override)) {
    const dates: Date[] = [];
    for (const row of rows) {
      const d = tryParseDate(row[override]);
      if (d) dates.push(d);
    }
    if (dates.length === 0) return { range: null, usedColumn: override, candidates };
    dates.sort((a, b) => a.getTime() - b.getTime());
    return {
      range: { from: fmt(dates[0]), to: fmt(dates[dates.length - 1]) },
      usedColumn: override,
      candidates,
    };
  }

  // Auto-pick: try each candidate (or all headers as fallback), return the column
  // that produced the most parseable dates. Avoids merging dates across semantically
  // different columns (order_date vs settlement_date).
  const colsToCheck = candidates.length > 0 ? candidates : headers;
  let bestCol: string | null = null;
  let bestDates: Date[] = [];
  for (const col of colsToCheck) {
    const dates: Date[] = [];
    for (const row of rows) {
      const d = tryParseDate(row[col]);
      if (d) dates.push(d);
    }
    if (dates.length > bestDates.length) {
      bestCol = col;
      bestDates = dates;
    }
  }

  if (!bestCol || bestDates.length === 0) {
    return { range: null, usedColumn: null, candidates };
  }

  bestDates.sort((a, b) => a.getTime() - b.getTime());
  return {
    range: { from: fmt(bestDates[0]), to: fmt(bestDates[bestDates.length - 1]) },
    usedColumn: bestCol,
    candidates,
  };
}

// ─── Outlet extraction ───

interface OutletDetail {
  name: string;
  id: string;       // Store ID / UUID from the platform
}

interface OutletExtractionResult {
  details: OutletDetail[];
  usedColumn: string | null;
  candidates: string[];
}

// Ordered list of outlet-name patterns (most specific → least). Kept here so
// the scanner's auto-detect stays aligned with SolutionOnboardingPanel's
// template preview. If you change one, update the other.
const OUTLET_NAME_PATTERNS: RegExp[] = [
  /store[\s_-]?name/i,
  /outlet[\s_-]?name/i,
  /branch[\s_-]?name/i,
  /restaurant[\s_-]?name/i,
  /location[\s_-]?name/i,
  /shop[\s_-]?name/i,
  /site[\s_-]?name/i,
  /merchant[\s_-]?name/i,
  /\bstore\b/i,
  /\boutlet\b/i,
  /\bbranch\b/i,
  /\brestaurant\b/i,
  /\blocation\b/i,
];
const OUTLET_EXCLUDE_RX = /\b(id|code|number|type|group|category|map|mdr|no)\b|id$|_id|_code|_no$/i;

function extractOutletDetails(
  rows: any[],
  headers: string[],
  override?: string | null,
): OutletExtractionResult {
  const candidates: string[] = [];
  const candidateSet = new Set<string>();
  for (const pat of OUTLET_NAME_PATTERNS) {
    for (const h of headers) {
      if (candidateSet.has(h)) continue;
      if (pat.test(h) && !OUTLET_EXCLUDE_RX.test(h)) {
        candidates.push(h);
        candidateSet.add(h);
      }
    }
  }

  let nameCol: string | null = null;
  if (override && headers.includes(override)) {
    nameCol = override;
  } else if (candidates.length > 0) {
    nameCol = candidates[0];
  }
  if (!nameCol) return { details: [], usedColumn: null, candidates };

  const idCols = headers.filter((h) =>
    /store[\s_-]?id|outlet[\s_-]?id|location[\s_-]?id|branch[\s_-]?id|site[\s_-]?id|merchant[\s_-]?id|storeid|outletid|branchid/i.test(h),
  );
  const idCol = idCols.length > 0 ? idCols[0] : null;

  const seen = new Map<string, OutletDetail>();
  for (const row of rows) {
    const name = row[nameCol];
    if (!name || typeof name !== "string" || !name.trim()) continue;
    const trimmed = name.trim();
    if (seen.has(trimmed)) continue;
    const id = idCol ? String(row[idCol] || "").trim() : "";
    seen.set(trimmed, { name: trimmed, id });
  }

  const details = Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  return { details, usedColumn: nameCol, candidates };
}

// ─── File reading ───

async function readFileHeaders(
  path: string,
  format: string,
): Promise<{ headers: string[]; rows: any[] }> {
  try {
    let wb: XLSX.WorkBook;

    if (format === "csv") {
      const content = await invoke<string>("read_file", { path });
      wb = XLSX.read(content, { type: "string" });
    } else {
      // xlsx/xls — binary read via Tauri FS plugin
      const bytes = await readFile(path);
      wb = XLSX.read(bytes, { type: "array" });
    }

    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) return { headers: [], rows: [] };

    const allRows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
    if (allRows.length === 0) return { headers: [], rows: [] };

    const headers = Object.keys(allRows[0]).map((h) => h.toLowerCase().trim());
    // Normalize row keys to lowercase to match headers
    const rows = allRows.slice(0, 200).map((row) => {
      const normalized: Record<string, any> = {};
      for (const [k, v] of Object.entries(row)) {
        normalized[k.toLowerCase().trim()] = v;
      }
      return normalized;
    });
    return { headers, rows };
  } catch (e) {
    console.warn(`Failed to read ${path}:`, e);
    return { headers: [], rows: [] };
  }
}

// ─── Hook ───

export function useFileScanner(fingerprintPath: string | null) {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scan = useCallback(
    async (folderPath: string, bindings?: ScanBindings) => {
      if (!fingerprintPath) {
        setError("No fingerprint index available");
        return;
      }

      setScanning(true);
      setError(null);

      try {
        // 1. Load fingerprint index
        const fpRaw = await invoke<string>("read_file", { path: fingerprintPath });
        const fingerprints: Record<string, ConnectorFingerprint> = JSON.parse(fpRaw);

        // 2. List files in folder
        const entries = await invoke<
          { name: string; path: string; size: number; is_directory: boolean }[]
        >("list_directory", { path: folderPath });

        const dataFiles = entries.filter((e) => {
          if (e.is_directory) return false;
          const ext = e.name.split(".").pop()?.toLowerCase();
          return ext === "csv" || ext === "xlsx" || ext === "xls";
        });

        // 3. Scan each file
        const scannedFiles: ScannedFile[] = [];

        for (const file of dataFiles) {
          const ext = file.name.split(".").pop()?.toLowerCase() || "";

          const { headers, rows } = await readFileHeaders(file.path, ext);
          const match = findBestMatch(headers, fingerprints);

          const binding = match ? bindings?.[match.connector] : undefined;
          const outletOverride = binding?.outlet || null;
          const dateOverride = binding?.date || null;

          const dateResult = rows.length > 0
            ? extractDateRange(rows, headers, dateOverride)
            : { range: null, usedColumn: null, candidates: [] };
          const outletResult = rows.length > 0
            ? extractOutletDetails(rows, headers, outletOverride)
            : { details: [], usedColumn: null, candidates: [] };

          scannedFiles.push({
            name: file.name,
            path: file.path,
            size: file.size,
            format: ext,
            headers,
            match,
            dateRange: dateResult.range,
            outlets: outletResult.details.map((d) => d.name),
            outletDetails: outletResult.details,
            usedOutletColumn: outletResult.usedColumn,
            usedDateColumn: dateResult.usedColumn,
            candidateOutletColumns: outletResult.candidates,
            candidateDateColumns: dateResult.candidates,
          });
        }

        const scanResult: ScanResult = {
          files: scannedFiles,
          scannedAt: new Date().toISOString(),
        };
        setResult(scanResult);
        return scanResult;
      } catch (e) {
        setError(String(e));
        return null;
      } finally {
        setScanning(false);
      }
    },
    [fingerprintPath],
  );

  return { scan, scanning, result, error };
}
