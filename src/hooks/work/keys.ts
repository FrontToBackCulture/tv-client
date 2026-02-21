// Work module query keys

export const workKeys = {
  all: ["work"] as const,
  projects: () => [...workKeys.all, "projects"] as const,
  project: (id: string) => [...workKeys.projects(), id] as const,
  tasks: () => [...workKeys.all, "tasks"] as const,
  tasksByProject: (projectId: string) =>
    [...workKeys.tasks(), "project", projectId] as const,
  task: (id: string) => [...workKeys.tasks(), id] as const,
  statuses: (projectId: string) =>
    [...workKeys.all, "statuses", projectId] as const,
  labels: () => [...workKeys.all, "labels"] as const,
  users: () => [...workKeys.all, "users"] as const,
  initiatives: () => [...workKeys.all, "initiatives"] as const,
  initiative: (id: string) => [...workKeys.initiatives(), id] as const,
  milestones: (projectId: string) =>
    [...workKeys.all, "milestones", projectId] as const,
  projectUpdates: (projectId: string) =>
    [...workKeys.all, "projectUpdates", projectId] as const,
};
