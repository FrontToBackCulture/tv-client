// src/modules/crm/ActivityTimeline.tsx
// Activity timeline for company details

import { useState } from "react";
import { Activity, ACTIVITY_TYPES } from "../../lib/crm/types";
import { ActivityForm } from "./ActivityForm";
import {
  Mail,
  FileText,
  Calendar,
  Phone,
  ClipboardList,
  TrendingUp,
  Clock,
} from "lucide-react";
import { formatDateActivity as formatDate } from "../../lib/date";

interface ActivityTimelineProps {
  companyId: string;
  activities: Activity[];
  onActivityAdded?: () => void;
}

export function ActivityTimeline({
  companyId,
  activities,
  onActivityAdded,
}: ActivityTimelineProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [activityType, setActivityType] = useState<Activity["type"]>("note");

  const getActivityIcon = (type: Activity["type"]) => {
    const iconProps = { size: 14 };
    switch (type) {
      case "email":
        return <Mail {...iconProps} />;
      case "note":
        return <FileText {...iconProps} />;
      case "meeting":
        return <Calendar {...iconProps} />;
      case "call":
        return <Phone {...iconProps} />;
      case "task":
        return <ClipboardList {...iconProps} />;
      case "stage_change":
        return <TrendingUp {...iconProps} />;
      default:
        return <Clock {...iconProps} />;
    }
  };

  const getActivityColor = (type: Activity["type"]) => {
    switch (type) {
      case "email":
        return "bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400";
      case "note":
        return "bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400";
      case "meeting":
        return "bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400";
      case "call":
        return "bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400";
      case "task":
        return "bg-yellow-100 dark:bg-yellow-900/50 text-yellow-600 dark:text-yellow-400";
      case "stage_change":
        return "bg-teal-100 dark:bg-teal-900/50 text-teal-600 dark:text-teal-400";
      default:
        return "bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400";
    }
  };

  return (
    <div className="p-4">
      {/* Quick add buttons */}
      <div className="flex gap-2 mb-4">
        {(["note", "meeting", "call"] as const).map((type) => {
          const typeConfig = ACTIVITY_TYPES.find((t) => t.value === type);
          return (
            <button
              key={type}
              onClick={() => {
                setActivityType(type);
                setShowAddForm(true);
              }}
              className="px-3 py-1.5 text-sm bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md text-zinc-700 dark:text-zinc-300 transition-colors"
            >
              + {typeConfig?.label}
            </button>
          );
        })}
      </div>

      {/* Timeline */}
      {activities.length === 0 ? (
        <div className="text-center py-8">
          <Clock size={32} className="mx-auto text-zinc-300 dark:text-zinc-700 mb-2" />
          <p className="text-zinc-500 text-sm">No activities yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {activities.map((activity) => (
            <div key={activity.id} className="flex gap-3">
              <div
                className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${getActivityColor(
                  activity.type
                )}`}
              >
                {getActivityIcon(activity.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">
                    {ACTIVITY_TYPES.find((t) => t.value === activity.type)?.label ||
                      activity.type}
                  </span>
                  <span className="text-zinc-400 dark:text-zinc-600">•</span>
                  <span className="text-zinc-500">
                    {formatDate(activity.activity_date)}
                  </span>
                </div>
                {activity.subject && (
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mt-1">
                    {activity.subject}
                  </p>
                )}
                {activity.content && (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1 whitespace-pre-wrap">
                    {activity.content}
                  </p>
                )}
                {activity.type === "stage_change" &&
                  activity.old_value &&
                  activity.new_value && (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                      <span className="line-through">{activity.old_value}</span>
                      {" → "}
                      <span className="font-medium text-zinc-700 dark:text-zinc-300">
                        {activity.new_value}
                      </span>
                    </p>
                  )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add activity form */}
      {showAddForm && (
        <ActivityForm
          companyId={companyId}
          initialType={activityType}
          onClose={() => setShowAddForm(false)}
          onSaved={() => {
            setShowAddForm(false);
            onActivityAdded?.();
          }}
        />
      )}
    </div>
  );
}
