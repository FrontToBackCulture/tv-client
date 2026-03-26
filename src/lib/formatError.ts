/**
 * Extract a human-readable message from an error.
 *
 * Tauri v2 command errors serialize as `{ code, message }`.
 * React Query stores them as `Error | null`, but Tauri errors
 * arrive as plain objects, so `String(err)` yields "[object Object]".
 */
export function formatError(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (typeof err === "object") {
    const obj = err as Record<string, unknown>;
    if (typeof obj.message === "string") return obj.message;
  }
  return String(err);
}
