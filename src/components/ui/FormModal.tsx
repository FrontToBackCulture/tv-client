import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./Button";
import { IconButton } from "./IconButton";

// Re-export form classes from FormField for backwards compatibility
export { inputClass, labelClass, selectClass } from "./FormField";

interface FormModalProps {
  title: string;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  submitLabel: string;
  isSaving?: boolean;
  error?: string | null;
  children: ReactNode;
  maxWidth?: string;
}

export function FormModal({
  title,
  onClose,
  onSubmit,
  submitLabel,
  isSaving,
  error,
  children,
  maxWidth = "max-w-xl",
}: FormModalProps) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-in">
      <div
        className={`bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl w-full ${maxWidth} max-h-[90vh] overflow-hidden animate-modal-in`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            {title}
          </h2>
          <IconButton icon={X} size={18} label="Close" onClick={onClose} />
        </div>

        <form
          onSubmit={onSubmit}
          className="px-5 py-5 space-y-5 overflow-y-auto max-h-[calc(90vh-130px)]"
        >
          {error && <FormError message={error} />}
          {children}
        </form>

        <div className="px-5 py-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-3">
          <Button variant="ghost" size="md" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={onSubmit}
            loading={isSaving}
          >
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function FormError({ message }: { message: string }) {
  return (
    <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 rounded text-sm">
      {message}
    </div>
  );
}
