// Query keys for cockpit data.

export const cockpitKeys = {
  all: ["cockpit"] as const,
  dailyFocus: () => [...cockpitKeys.all, "daily_focus"] as const,
  dailyFocusFor: (date: string) => [...cockpitKeys.dailyFocus(), date] as const,
  deliveryStates: () => [...cockpitKeys.all, "delivery_states"] as const,
  deliveryState: (id: string) => [...cockpitKeys.deliveryStates(), id] as const,
  escalations: () => [...cockpitKeys.all, "escalations"] as const,
  escalationsUnresolved: () => [...cockpitKeys.escalations(), "unresolved"] as const,
  weeklySummary: (weekStart: string) => [...cockpitKeys.all, "weekly_summary", weekStart] as const,
  planWeekProgress: (weekNumber: number) => [...cockpitKeys.all, "plan_week_progress", weekNumber] as const,
};
