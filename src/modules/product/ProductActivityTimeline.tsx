// src/modules/product/ProductActivityTimeline.tsx
// Unified activity feed for any product entity

import { useProductActivity } from "../../hooks/product";
import type { ProductEntityType } from "../../lib/product/types";
import { Loader2, Clock } from "lucide-react";

interface ProductActivityTimelineProps {
  entityType: ProductEntityType;
  entityId: string;
}

export function ProductActivityTimeline({ entityType, entityId }: ProductActivityTimelineProps) {
  const { data: activities, isLoading } = useProductActivity({
    entityType,
    entityId,
    limit: 50,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={20} className="text-zinc-400 animate-spin" />
      </div>
    );
  }

  const all = activities ?? [];

  if (all.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-zinc-500">
        <Clock size={24} className="mb-2 opacity-50" />
        <p className="text-sm">No activity recorded</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {all.map((activity) => (
        <div key={activity.id} className="flex gap-3">
          {/* Timeline dot */}
          <div className="flex flex-col items-center pt-1.5">
            <div className="w-2 h-2 rounded-full bg-zinc-400 dark:bg-zinc-600" />
            <div className="w-px flex-1 bg-zinc-200 dark:bg-zinc-800 mt-1" />
          </div>

          {/* Content */}
          <div className="flex-1 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {activity.action}
              </span>
              {activity.actor_name && (
                <span className="text-xs text-zinc-400">
                  by {activity.actor_name}
                </span>
              )}
            </div>
            {activity.content && (
              <p className="text-xs text-zinc-500 mt-0.5">{activity.content}</p>
            )}
            {(activity.old_value || activity.new_value) && (
              <div className="text-xs text-zinc-400 mt-0.5">
                {activity.old_value && (
                  <span className="line-through mr-2">{String(activity.old_value)}</span>
                )}
                {activity.new_value && (
                  <span className="text-zinc-600 dark:text-zinc-300">{String(activity.new_value)}</span>
                )}
              </div>
            )}
            <time className="text-[11px] text-zinc-400 mt-1 block">
              {new Date(activity.created_at).toLocaleString()}
            </time>
          </div>
        </div>
      ))}
    </div>
  );
}
