// src/modules/work/index.ts
// Export all Work module components

export { WorkModule } from "./WorkModule";
export { TaskDetailPanel } from "./TaskDetailPanel";
export { TaskForm } from "./TaskForm";
export { StatusIcon, PriorityBars } from "./StatusIcon";
export {
  InboxView,
  DashboardView,
  BoardView,
  TrackerView,
  ScopeFilterBar,
  ViewTab,
  useInitiativeProjects,
} from "./WorkViews";
export type { WorkView } from "./WorkViews";
