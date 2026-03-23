import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/cn";

// Re-export the class strings for backwards compatibility with existing forms
export const inputClass =
  "w-full px-3 py-2.5 border-0 bg-zinc-50 dark:bg-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 transition";

export const labelClass =
  "block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1";

export const selectClass = inputClass;

export const checkboxClass =
  "rounded border-zinc-400 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-teal-500 focus:ring-teal-500";

// --- Composable FormField ---

interface FormFieldProps {
  label: string;
  required?: boolean;
  icon?: LucideIcon;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}

export function FormField({
  label,
  required,
  icon: Icon,
  error,
  hint,
  className,
  children,
}: FormFieldProps) {
  return (
    <div className={className}>
      <label className={labelClass}>
        {Icon && <Icon size={14} className="inline mr-1" />}
        {label}
        {required && " *"}
      </label>
      {children}
      {error && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      {hint && !error && (
        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">{hint}</p>
      )}
    </div>
  );
}

// --- Convenience input components ---

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export function Input({ className, error, ...props }: InputProps) {
  return (
    <input
      className={cn(
        inputClass,
        error && "border-red-500 dark:border-red-500",
        className,
      )}
      {...props}
    />
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export function Select({ className, error, children, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        selectClass,
        error && "border-red-500 dark:border-red-500",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export function Textarea({ className, error, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        inputClass,
        error && "border-red-500 dark:border-red-500",
        className,
      )}
      {...props}
    />
  );
}

interface CheckboxFieldProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}

export function CheckboxField({
  label,
  checked,
  onChange,
  className,
}: CheckboxFieldProps) {
  return (
    <label className={cn("flex items-center gap-2 cursor-pointer", className)}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className={checkboxClass}
      />
      <span className="text-sm text-zinc-600 dark:text-zinc-400">{label}</span>
    </label>
  );
}
