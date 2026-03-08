import { Button } from "./Button";

interface DeleteConfirmProps {
  title: string;
  message: React.ReactNode;
  isDeleting?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirm({
  title,
  message,
  isDeleting,
  onConfirm,
  onCancel,
}: DeleteConfirmProps) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-5 max-w-sm w-full mx-4 shadow-xl animate-modal-in">
        <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
          {title}
        </h3>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
          {message}
        </p>
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="md"
            onClick={onCancel}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            size="md"
            onClick={onConfirm}
            loading={isDeleting}
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
