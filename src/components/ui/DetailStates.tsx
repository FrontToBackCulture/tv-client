import { Loader2 } from "lucide-react";
import { cn } from "../../lib/cn";

/** Full-height centered spinner for detail panels and full-page loading. */
export function DetailLoading() {
  return (
    <div className="h-full flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <Loader2
        size={24}
        className="text-zinc-400 animate-spin"
      />
    </div>
  );
}

/** Full-height centered "not found" message. */
export function DetailNotFound({ message = "Not found" }: { message?: string }) {
  return (
    <div className="h-full flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <p className="text-zinc-500">{message}</p>
    </div>
  );
}

/** Centered spinner for sections/cards/tabs. Fills available space without assuming full height. */
export function SectionLoading({ message, className }: { message?: string; className?: string }) {
  return (
    <div className={cn("flex items-center justify-center py-8", className)}>
      <div className="flex items-center gap-2 text-zinc-400">
        <Loader2 size={16} className="animate-spin" />
        {message && <span className="text-xs">{message}</span>}
      </div>
    </div>
  );
}

/** Inline loading indicator for use within content flow (e.g. "Loading items..."). */
export function InlineLoading({ message = "Loading..." }: { message?: string }) {
  return (
    <div className="flex items-center gap-2 py-2 text-xs text-zinc-400">
      <Loader2 size={12} className="animate-spin" />
      {message}
    </div>
  );
}

/** Error banner for non-form contexts. For form errors, use FormError. */
export function ErrorBanner({ message, className }: { message: string; className?: string }) {
  return (
    <div className={cn(
      "px-3 py-2 text-sm rounded bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800",
      className,
    )}>
      {message}
    </div>
  );
}
