// src/modules/work/WorkViews.tsx
// Re-exports from split files for backward compatibility

export type { WorkView, InitiativeProjectLink } from "./workViewsShared";
export {
  useInitiativeProjects,
  ViewTab,
  ScopeFilterBar,
} from "./workViewsShared";
export { InboxView } from "./WorkInboxView";
export { BoardView } from "./WorkBoardView";
export { TrackerView } from "./WorkTrackerView";
export { MyTasksView, TeamTasksView } from "./WorkTaskDashboard";
