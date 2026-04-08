/**
 * Scope spreadsheet utilities — template download with Excel data validation,
 * and upload parser that converts XLSX back into InstanceData fields.
 */
import * as XLSX from "xlsx";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import type { InstanceData, ScopeOutlet, PaymentMethod, BankAccount } from "../../../lib/solutions/types";
import { POS_OPTIONS, PAYMENT_METHOD_OPTIONS, BANK_OPTIONS } from "../../../lib/solutions/types";

// ─── Template download ─────────────────────────────────────────────────────────

export async function downloadScopeTemplate(existingData?: InstanceData) {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Outlets ──
  const outletHeaders = ["Entity", "Outlet", "POS (comma-separated)", "Notes"];
  const outletRows: string[][] = existingData?.scope?.length
    ? existingData.scope.map((s) => [s.entity, s.outlet, (s.pos || []).join(", "), s.notes])
    : [["", "", "", ""]]; // one blank row as example
  const outletSheet = XLSX.utils.aoa_to_sheet([outletHeaders, ...outletRows]);

  // Column widths
  outletSheet["!cols"] = [{ wch: 20 }, { wch: 25 }, { wch: 30 }, { wch: 30 }];

  // Data validation: POS column (C2:C500) — list of valid POS options
  // Note: Excel list validation supports up to ~255 chars in the formula string,
  // so we use the full list since POS_OPTIONS is short enough
  outletSheet["!dataValidation"] = [
    {
      sqref: "C2:C500",
      type: "list",
      operator: "equal",
      formula1: `"${POS_OPTIONS.join(",")}"`,
      showInputMessage: true,
      promptTitle: "POS System",
      prompt: "Select a POS system. For multiple, type comma-separated values (e.g. Aptsys, Oracle)",
      showErrorMessage: true,
      errorTitle: "Invalid POS",
      error: "Use one of the predefined POS systems, or comma-separate multiples.",
      errorStyle: "warning",
    },
  ];
  XLSX.utils.book_append_sheet(wb, outletSheet, "Outlets");

  // ── Sheet 2: Payment Methods ──
  const pmHeaders = ["Payment Method", "Excluded Outlets (comma-separated)", "Notes"];
  const pmRows: string[][] = existingData?.paymentMethods?.length
    ? existingData.paymentMethods.map((pm) => [pm.name, (pm.excludedOutlets || []).join(", "), pm.notes])
    : [["", "", ""]];
  const pmSheet = XLSX.utils.aoa_to_sheet([pmHeaders, ...pmRows]);

  pmSheet["!cols"] = [{ wch: 25 }, { wch: 40 }, { wch: 30 }];

  // The full PAYMENT_METHOD_OPTIONS list is ~350 chars which exceeds Excel's 255 char
  // in-cell validation limit. Split into a hidden reference sheet instead.
  // For now, use the list approach with a truncation-safe subset, or use a ref sheet.
  // We'll use a reference sheet approach for robustness.
  pmSheet["!dataValidation"] = [
    {
      sqref: "A2:A500",
      type: "list",
      operator: "equal",
      formula1: "Valid Options!$B$2:$B$50",
      showInputMessage: true,
      promptTitle: "Payment Method",
      prompt: "Select from the predefined payment methods",
      showErrorMessage: true,
      errorTitle: "Invalid Payment Method",
      error: "Use one of the predefined payment methods from the Valid Options sheet.",
      errorStyle: "warning",
    },
  ];
  XLSX.utils.book_append_sheet(wb, pmSheet, "Payment Methods");

  // ── Sheet 3: Bank Accounts ──
  const bankHeaders = ["Bank", "Account No.", "Outlets (comma-separated, blank = all)", "Notes"];
  const bankRows: string[][] = existingData?.banks?.length
    ? existingData.banks.map((b) => [b.bank, b.account, (b.outlets || []).join(", "), b.notes])
    : [["", "", "", ""]];
  const bankSheet = XLSX.utils.aoa_to_sheet([bankHeaders, ...bankRows]);

  bankSheet["!cols"] = [{ wch: 12 }, { wch: 20 }, { wch: 40 }, { wch: 30 }];

  bankSheet["!dataValidation"] = [
    {
      sqref: "A2:A500",
      type: "list",
      operator: "equal",
      formula1: `"${BANK_OPTIONS.join(",")}"`,
      showInputMessage: true,
      promptTitle: "Bank",
      prompt: "Select a bank",
      showErrorMessage: true,
      errorTitle: "Invalid Bank",
      error: "Use one of: DBS, OCBC, UOB",
      errorStyle: "stop",
    },
  ];
  XLSX.utils.book_append_sheet(wb, bankSheet, "Bank Accounts");

  // ── Sheet 4: Periods (bonus) ──
  const periodHeaders = ["Period (e.g. Jan 2025)"];
  const periodRows: string[][] = existingData?.periods?.length
    ? existingData.periods.map((p) => [p])
    : [[""]];
  const periodSheet = XLSX.utils.aoa_to_sheet([periodHeaders, ...periodRows]);
  periodSheet["!cols"] = [{ wch: 25 }];
  XLSX.utils.book_append_sheet(wb, periodSheet, "Periods");

  // ── Reference sheet for valid option lists ──
  const refData: string[][] = [["POS Options", "Payment Method Options", "Bank Options"]];
  const maxLen = Math.max(POS_OPTIONS.length, PAYMENT_METHOD_OPTIONS.length, BANK_OPTIONS.length);
  for (let i = 0; i < maxLen; i++) {
    refData.push([
      POS_OPTIONS[i] || "",
      PAYMENT_METHOD_OPTIONS[i] || "",
      BANK_OPTIONS[i] || "",
    ]);
  }
  const refSheet = XLSX.utils.aoa_to_sheet(refData);
  XLSX.utils.book_append_sheet(wb, refSheet, "Valid Options");
  // Keep Valid Options sheet visible so users can reference valid values

  // ── Save via Tauri file dialog ──
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const filePath = await save({
    defaultPath: "scope-template.xlsx",
    filters: [{ name: "Excel", extensions: ["xlsx"] }],
  });
  if (!filePath) return; // user cancelled
  await writeFile(filePath, new Uint8Array(buf));
}

// ─── Upload parser ──────────────────────────────────────────────────────────────

interface ParseResult {
  scope: ScopeOutlet[];
  paymentMethods: PaymentMethod[];
  banks: BankAccount[];
  periods: string[];
  warnings: string[];
}

export function parseScopeSpreadsheet(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const warnings: string[] = [];

        // ── Parse Outlets ──
        const scope: ScopeOutlet[] = [];
        const outletSheet = wb.Sheets["Outlets"] || wb.Sheets[wb.SheetNames[0]];
        if (outletSheet) {
          const rows = XLSX.utils.sheet_to_json<Record<string, string>>(outletSheet, { defval: "" });
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const entity = str(row["Entity"] || row["entity"] || "");
            const outlet = str(row["Outlet"] || row["outlet"] || "");
            if (!outlet && !entity) continue; // skip empty rows

            const posRaw = str(row["POS (comma-separated)"] || row["POS"] || row["pos"] || "");
            const posList = posRaw
              .split(/[,;]/)
              .map((s) => s.trim())
              .filter(Boolean);

            // Validate POS values
            const validPos: string[] = [];
            for (const p of posList) {
              const match = fuzzyMatch(p, POS_OPTIONS as unknown as string[]);
              if (match) {
                validPos.push(match);
              } else {
                warnings.push(`Row ${i + 2} Outlets: Unknown POS "${p}" — skipped`);
              }
            }

            const notes = str(row["Notes"] || row["notes"] || "");
            scope.push({ entity, outlet, pos: validPos, notes });
          }
        }

        // ── Parse Payment Methods ──
        const paymentMethods: PaymentMethod[] = [];
        const pmSheet = wb.Sheets["Payment Methods"] || wb.Sheets[wb.SheetNames[1]];
        if (pmSheet) {
          const rows = XLSX.utils.sheet_to_json<Record<string, string>>(pmSheet, { defval: "" });
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const nameRaw = str(row["Payment Method"] || row["payment_method"] || row["Payment_Method"] || "");
            if (!nameRaw) continue;

            const match = fuzzyMatch(nameRaw, PAYMENT_METHOD_OPTIONS as unknown as string[]);
            const name = match || nameRaw; // keep original if no match, but warn
            if (!match) {
              warnings.push(`Row ${i + 2} Payment Methods: "${nameRaw}" not in predefined list — added as-is`);
            }

            // Skip duplicates
            if (paymentMethods.some((pm) => pm.name === name)) {
              warnings.push(`Row ${i + 2} Payment Methods: Duplicate "${name}" — skipped`);
              continue;
            }

            const excludedRaw = str(row["Excluded Outlets (comma-separated)"] || row["Excluded Outlets"] || row["excluded_outlets"] || "");
            const excludedOutlets = excludedRaw.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
            const notes = str(row["Notes"] || row["notes"] || "");

            paymentMethods.push({ name, appliesTo: "all", excludedOutlets, notes });
          }
        }

        // ── Parse Bank Accounts ──
        const banks: BankAccount[] = [];
        const bankSheet = wb.Sheets["Bank Accounts"] || wb.Sheets[wb.SheetNames[2]];
        if (bankSheet) {
          const rows = XLSX.utils.sheet_to_json<Record<string, string>>(bankSheet, { defval: "" });
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const bankRaw = str(row["Bank"] || row["bank"] || "");
            if (!bankRaw) continue;

            const bankMatch = fuzzyMatch(bankRaw, BANK_OPTIONS as unknown as string[]);
            if (!bankMatch) {
              warnings.push(`Row ${i + 2} Bank Accounts: Unknown bank "${bankRaw}" — skipped`);
              continue;
            }

            const account = str(row["Account No."] || row["Account"] || row["account"] || "");
            const outletsRaw = str(row["Outlets (comma-separated, blank = all)"] || row["Outlets"] || row["outlets"] || "");
            const outlets = outletsRaw.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
            const notes = str(row["Notes"] || row["notes"] || "");

            banks.push({ bank: bankMatch, account, outlets, paymentMethods: [], notes });
          }
        }

        // ── Parse Periods ──
        const periods: string[] = [];
        const periodSheet = wb.Sheets["Periods"] || wb.Sheets[wb.SheetNames[3]];
        if (periodSheet) {
          const rows = XLSX.utils.sheet_to_json<Record<string, string>>(periodSheet, { defval: "" });
          for (const row of rows) {
            const val = str(Object.values(row)[0] || "");
            if (val) periods.push(val);
          }
        }

        resolve({ scope, paymentMethods, banks, periods, warnings });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

/** Case-insensitive fuzzy match against a list of valid options */
function fuzzyMatch(input: string, options: string[]): string | null {
  const lower = input.toLowerCase().replace(/[\s_-]/g, "");
  // Exact match first
  for (const opt of options) {
    if (opt.toLowerCase() === input.toLowerCase()) return opt;
  }
  // Normalized match (ignore spaces, underscores, hyphens)
  for (const opt of options) {
    if (opt.toLowerCase().replace(/[\s_-]/g, "") === lower) return opt;
  }
  return null;
}
