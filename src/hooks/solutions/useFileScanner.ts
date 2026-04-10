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
}

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

function extractDateRange(rows: any[], headers: string[]): { from: string; to: string } | null {
  // Find date-like columns — broad matching
  const dateCols = headers.filter((h) =>
    /date|time|period|created|updated|transaction|order|settlement|transfer|processed|payout|posting|effective|start|end|from|to|month|day/i.test(h),
  );

  // If no obvious date columns, try all columns on first row
  const colsToCheck = dateCols.length > 0 ? dateCols : headers;

  const dates: Date[] = [];

  for (const row of rows) {
    for (const col of colsToCheck) {
      const d = tryParseDate(row[col]);
      if (d) {
        dates.push(d);
        // If checking all columns and we found a date, remember this column
        // and stop checking non-date columns for subsequent rows
      }
    }
  }

  if (dates.length === 0) return null;

  dates.sort((a, b) => a.getTime() - b.getTime());
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(dates[0]), to: fmt(dates[dates.length - 1]) };
}

// ─── Outlet extraction ───

interface OutletDetail {
  name: string;
  id: string;       // Store ID / UUID from the platform
}

function extractOutlets(rows: any[], headers: string[]): string[] {
  const details = extractOutletDetails(rows, headers);
  return details.map((d) => d.name);
}

function extractOutletDetails(rows: any[], headers: string[]): OutletDetail[] {
  // Find outlet/store name columns
  const nameCols = headers.filter((h) =>
    /store.?name|outlet.?name|store|outlet|location|branch|restaurant|shop|site|venue/i.test(h)
    && !/id$|_id$|code$|_code$|number$|_no$|merchant/i.test(h)
  );

  // Find store ID columns
  const idCols = headers.filter((h) =>
    /store.?id|outlet.?id|location.?id|branch.?id|site.?id|merchant.?id/i.test(h)
  );

  if (nameCols.length === 0) return [];

  const nameCol = nameCols[0];
  const idCol = idCols.length > 0 ? idCols[0] : null;

  const seen = new Map<string, OutletDetail>(); // name → detail
  for (const row of rows) {
    const name = row[nameCol];
    if (!name || typeof name !== "string" || !name.trim()) continue;
    const trimmed = name.trim();
    if (seen.has(trimmed)) continue;
    const id = idCol ? String(row[idCol] || "").trim() : "";
    seen.set(trimmed, { name: trimmed, id });
  }

  return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
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
    async (folderPath: string) => {
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
          const dateRange = rows.length > 0 ? extractDateRange(rows, headers) : null;
          const outletDetails = rows.length > 0 ? extractOutletDetails(rows, headers) : [];
          const outlets = outletDetails.map((d) => d.name);

          scannedFiles.push({
            name: file.name,
            path: file.path,
            size: file.size,
            format: ext,
            headers,
            match,
            dateRange,
            outlets,
            outletDetails,
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
