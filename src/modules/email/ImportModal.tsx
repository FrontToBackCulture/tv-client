// src/modules/email/ImportModal.tsx
// CSV upload modal with preview and import summary

import { useState, useRef } from "react";
import { X, Upload, CheckCircle, Download } from "lucide-react";
import { useImportContacts } from "../../hooks/email";
import type { ImportResult } from "../../lib/email/types";

interface ImportModalProps {
  onClose: () => void;
}

export function ImportModal({ onClose }: ImportModalProps) {
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importContacts = useImportContacts();

  const handleDownloadTemplate = () => {
    const csv = "email,first_name,last_name,group\njohn@example.com,John,Doe,Newsletter\njane@example.com,Jane,Smith,Newsletter\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    setCsvText(text);
  };

  const handleImport = async () => {
    if (!csvText.trim()) return;
    const importResult = await importContacts.mutateAsync(csvText);
    setResult(importResult);
  };

  const lines = csvText.trim().split("\n");
  const previewRows = lines.slice(0, 6); // header + 5 rows

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-lg w-[560px] max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Import Contacts</h2>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 rounded">
            <X size={14} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {result ? (
            /* Import result summary */
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle size={16} className="text-green-500" />
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">Import Complete</span>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <StatCard label="Imported" value={result.imported} color="green" />
                <StatCard label="Skipped" value={result.skipped} color="gray" />
                <StatCard label="Errors" value={result.errors} color="red" />
              </div>

              {result.groupsCreated.length > 0 && (
                <div>
                  <p className="text-[10px] font-medium text-zinc-500 mb-1">Groups created:</p>
                  <p className="text-xs text-zinc-700 dark:text-zinc-300">
                    {result.groupsCreated.join(", ")}
                  </p>
                </div>
              )}

              {result.errorDetails.length > 0 && (
                <div>
                  <p className="text-[10px] font-medium text-red-500 mb-1">Errors:</p>
                  <div className="max-h-24 overflow-auto text-[10px] text-red-400 space-y-0.5">
                    {result.errorDetails.map((err, i) => (
                      <p key={i}>{err}</p>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  onClick={onClose}
                  className="px-3 py-1.5 text-xs bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 rounded-md hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            /* Upload + preview */
            <>
              <div>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-2">
                  Upload a CSV with columns: <code className="text-[10px] bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded">email</code> (required),{" "}
                  <code className="text-[10px] bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded">first_name</code>,{" "}
                  <code className="text-[10px] bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded">last_name</code>,{" "}
                  <code className="text-[10px] bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded">group</code>
                </p>

                <button
                  onClick={handleDownloadTemplate}
                  className="inline-flex items-center gap-1.5 text-[11px] text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 font-medium"
                >
                  <Download size={12} />
                  Download template CSV
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-8 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-lg text-center hover:border-teal-500 transition-colors"
                >
                  <Upload size={20} className="mx-auto mb-2 text-zinc-400" />
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {fileName ? fileName : "Click to select CSV file"}
                  </p>
                </button>
              </div>

              {csvText && (
                <div>
                  <p className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                    Preview ({lines.length - 1} rows)
                  </p>
                  <div className="overflow-auto max-h-40 border border-zinc-200 dark:border-zinc-800 rounded-md">
                    <table className="w-full text-[10px]">
                      <tbody>
                        {previewRows.map((row, i) => (
                          <tr
                            key={i}
                            className={
                              i === 0
                                ? "bg-zinc-50 dark:bg-zinc-800 font-semibold"
                                : "border-t border-zinc-100 dark:border-zinc-800"
                            }
                          >
                            {row.split(",").map((cell, j) => (
                              <td key={j} className="px-2 py-1 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                                {cell.trim()}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {lines.length > 6 && (
                    <p className="text-[10px] text-zinc-400 mt-1">
                      ...and {lines.length - 6} more rows
                    </p>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  disabled={!csvText || importContacts.isPending}
                  className="px-3 py-1.5 text-xs bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 rounded-md hover:bg-zinc-700 dark:hover:bg-zinc-300 disabled:opacity-50 transition-colors"
                >
                  {importContacts.isPending ? "Importing..." : "Import"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    green: "text-green-600 dark:text-green-400",
    gray: "text-zinc-600 dark:text-zinc-400",
    red: "text-red-600 dark:text-red-400",
  };

  return (
    <div className="bg-zinc-50 dark:bg-zinc-800 rounded-md px-3 py-2 text-center">
      <p className={`text-lg font-semibold ${colors[color]}`}>{value}</p>
      <p className="text-[10px] text-zinc-400">{label}</p>
    </div>
  );
}
