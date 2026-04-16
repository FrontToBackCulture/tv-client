import { useMemo } from "react";
import { useAllTasks } from "../../hooks/work/useTasks";

export type MascotMood = "focused" | "happy" | "tired" | "asleep" | "hyped" | "sad";

export function useMascotMood(): MascotMood {
  const { data: tasks = [] } = useAllTasks();

  return useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 6 || hour >= 24) return "asleep";

    const now = Date.now();
    const overdue = tasks.filter((t: any) => {
      const due = t.due_date ? new Date(t.due_date).getTime() : null;
      const done = t.status?.type === "done" || t.status?.type === "cancelled";
      return due && due < now && !done;
    }).length;

    if (overdue >= 5) return "tired";
    if (overdue === 0) return "happy";
    return "focused";
  }, [tasks]);
}
