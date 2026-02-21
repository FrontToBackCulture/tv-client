// SQL execution + generation hooks

import { useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

// ============================================================
// Types
// ============================================================

export interface SqlExecuteResult {
  domain: string;
  sql: string;
  row_count: number;
  columns: string[];
  data: Record<string, unknown>[];
  truncated: boolean;
  error: string | null;
}

export interface SqlGenerateResult {
  domain: string;
  prompt: string;
  sql: string;
  explanation: string;
  tables_used: string[];
  error: string | null;
}

// ============================================================
// Hooks
// ============================================================

/** Execute a SQL query against a VAL domain */
export function useValExecuteSql() {
  return useMutation({
    mutationFn: ({ domain, sql, limit }: { domain: string; sql: string; limit?: number }) =>
      invoke<SqlExecuteResult>("val_execute_sql", { domain, sql, limit: limit ?? null }),
  });
}

/** Generate SQL from natural language using Claude Haiku */
export function useValGenerateSql() {
  return useMutation({
    mutationFn: ({ domain, prompt }: { domain: string; prompt: string }) =>
      invoke<SqlGenerateResult>("val_generate_sql", { domain, prompt }),
  });
}
