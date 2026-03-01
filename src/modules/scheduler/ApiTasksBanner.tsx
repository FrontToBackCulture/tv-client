import { useState, useEffect } from "react";
import { Loader2, Slack } from "lucide-react";
import { useApiTasks, type ApiTask } from "../../hooks/scheduler/useApiTasks";

export function ApiTasksBanner() {
  const { data: tasks } = useApiTasks();

  const running = tasks?.filter((t) => t.status === "running") ?? [];
  if (running.length === 0) return null;

  return (
    <div className="flex-shrink-0 border-b border-zinc-100 dark:border-zinc-800/50 px-4 py-2 space-y-1.5">
      {running.map((task) => (
        <TaskRow key={task.id} task={task} />
      ))}
    </div>
  );
}

function TaskRow({ task }: { task: ApiTask }) {
  const [elapsed, setElapsed] = useState(() =>
    Math.floor((Date.now() - task.startedAt) / 1000)
  );

  useEffect(() => {
    setElapsed(Math.floor((Date.now() - task.startedAt) / 1000));
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - task.startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [task.startedAt]);

  const estimateSecs = task.estimateMs ? Math.floor(task.estimateMs / 1000) : undefined;
  const skillLabel = SKILL_LABELS[task.skill] ?? task.skill;

  return (
    <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400">
      <Loader2 size={14} className="animate-spin flex-shrink-0" />
      <Slack size={12} className="flex-shrink-0 opacity-60" />
      <span className="font-medium">{skillLabel}</span>
      <span className="text-zinc-400 dark:text-zinc-500">
        {formatElapsed(elapsed)}
        {estimateSecs ? ` / ~${formatElapsed(estimateSecs)}` : ""}
      </span>
      <span className="text-zinc-400 dark:text-zinc-500">
        by @{task.triggeredBy}
      </span>
    </div>
  );
}

const SKILL_LABELS: Record<string, string> = {
  "/sod": "Morning SOD Check",
  "/test": "Quick Health Check (koi)",
};

function formatElapsed(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}
