import { cn } from "../../lib/cn";

interface SkeletonProps {
  className?: string;
}

/** Base skeleton primitive with pulsating animation. */
export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn("animate-pulse bg-zinc-200 dark:bg-zinc-800 rounded", className)} />;
}

/** Skeleton for list views (email list, task list, etc.) */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="w-8 h-8 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-2 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Skeleton for card grids. */
export function CardSkeleton() {
  return (
    <div className="p-4 border border-zinc-200 dark:border-zinc-800 rounded-lg space-y-3">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
      <div className="flex gap-2 pt-2">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-12 rounded-full" />
      </div>
    </div>
  );
}

/** Skeleton for detail panels (right side). */
export function DetailSkeleton() {
  return (
    <div className="p-6 space-y-6">
      {/* Header area */}
      <div className="space-y-3">
        <Skeleton className="h-7 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      {/* Toolbar / tabs area */}
      <div className="flex gap-3">
        <Skeleton className="h-8 w-20 rounded-md" />
        <Skeleton className="h-8 w-20 rounded-md" />
        <Skeleton className="h-8 w-20 rounded-md" />
        <div className="flex-1" />
        <Skeleton className="h-8 w-32 rounded-md" />
      </div>
      {/* Content rows */}
      <div className="space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
