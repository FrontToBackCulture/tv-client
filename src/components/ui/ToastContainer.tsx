// src/components/ui/ToastContainer.tsx

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Info, AlertTriangle, Loader2, X } from "lucide-react";
import { cn } from "../../lib/cn";
import { useToastStore, type Toast, type ToastType } from "../../stores/toastStore";

const icons: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
  loading: Loader2,
};

const styles: Record<ToastType, string> = {
  success: "border-success/30 bg-success-light text-success-dark dark:text-success",
  error: "border-error/30 bg-error-light text-error-dark dark:text-error",
  info: "border-info/30 bg-info-light text-info-dark dark:text-info",
  warning: "border-warning/30 bg-warning-light text-warning-dark dark:text-warning",
  loading: "border-info/30 bg-info-light text-info-dark dark:text-info",
};

const iconColors: Record<ToastType, string> = {
  success: "text-success",
  error: "text-error",
  info: "text-info",
  warning: "text-warning",
  loading: "text-info",
};

function ToastItem({ toast }: { toast: Toast }) {
  const removeToast = useToastStore((s) => s.removeToast);
  const [exiting, setExiting] = useState(false);
  const Icon = icons[toast.type];
  const isLoading = toast.type === "loading";

  // Animate out before removal (skip for loading toasts)
  useEffect(() => {
    if (isLoading || toast.duration <= 0) return;
    const timer = setTimeout(() => setExiting(true), toast.duration - 200);
    return () => clearTimeout(timer);
  }, [toast.duration, isLoading]);

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg border shadow-md text-sm max-w-xs transition-all duration-200",
        styles[toast.type],
        exiting ? "opacity-0 translate-x-4" : "animate-slide-in",
      )}
    >
      <Icon size={16} className={cn("flex-shrink-0 mt-0.5", iconColors[toast.type], isLoading && "animate-spin")} />
      <span className="flex-1 leading-snug">{toast.message}</span>
      <button
        onClick={() => removeToast(toast.id)}
        className="flex-shrink-0 mt-0.5 opacity-50 hover:opacity-100 transition-opacity"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-16 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
