import { forwardRef } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/cn";

type IconButtonVariant = "default" | "danger";

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  size?: number;
  variant?: IconButtonVariant;
  label: string;
}

const variantStyles: Record<IconButtonVariant, string> = {
  default:
    "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800",
  danger:
    "text-zinc-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-zinc-100 dark:hover:bg-zinc-800",
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon: Icon, size = 16, variant = "default", label, className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        title={label}
        aria-label={label}
        className={cn(
          "p-1 rounded transition-colors",
          variantStyles[variant],
          className,
        )}
        {...props}
      >
        <Icon size={size} />
      </button>
    );
  },
);

IconButton.displayName = "IconButton";
