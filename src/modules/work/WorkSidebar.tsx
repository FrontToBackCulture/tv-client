// src/modules/work/WorkSidebar.tsx
// Left sidebar with projects, initiatives, and navigation

import { useState, useMemo } from "react";
import type { Project, Initiative } from "../../lib/work/types";
import {
  Inbox,
  FolderKanban,
  Rocket,
  ChevronRight,
  Plus,
  Settings,
  Circle,
} from "lucide-react";

interface WorkSidebarProps {
  projects: Project[];
  initiatives: Initiative[];
  selectedProjectId: string | null;
  selectedInitiativeId: string | null;
  onProjectSelect: (projectId: string | null) => void;
  onInitiativeSelect: (initiativeId: string | null) => void;
  onNewProject?: () => void;
  onNewInitiative?: () => void;
}

export function WorkSidebar({
  projects,
  initiatives,
  selectedProjectId,
  selectedInitiativeId,
  onProjectSelect,
  onInitiativeSelect,
  onNewProject,
  onNewInitiative,
}: WorkSidebarProps) {
  const [projectsExpanded, setProjectsExpanded] = useState(true);
  const [initiativesExpanded, setInitiativesExpanded] = useState(true);

  // Find inbox project
  const inboxProject = useMemo(
    () => projects.find((p) => p.slug === "inbox" || p.name.toLowerCase() === "inbox"),
    [projects]
  );

  // Non-inbox projects
  const regularProjects = useMemo(
    () => projects.filter((p) => p.id !== inboxProject?.id),
    [projects, inboxProject]
  );

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="px-3 py-3 border-b border-slate-200 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Work</h2>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-2">
        {/* Inbox */}
        {inboxProject && (
          <div className="px-2 mb-2">
            <button
              onClick={() => onProjectSelect(inboxProject.id)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
                selectedProjectId === inboxProject.id
                  ? "bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-900 hover:text-zinc-800 dark:hover:text-zinc-300"
              }`}
            >
              <Inbox size={16} />
              <span>Inbox</span>
            </button>
          </div>
        )}

        {/* Projects section */}
        <div className="px-2 mb-2">
          <button
            onClick={() => setProjectsExpanded(!projectsExpanded)}
            className="w-full flex items-center gap-1 px-2 py-1 text-xs font-medium text-zinc-500 hover:text-zinc-400 uppercase tracking-wider"
          >
            <ChevronRight
              size={12}
              className={`transition-transform ${projectsExpanded ? "rotate-90" : ""}`}
            />
            <FolderKanban size={12} />
            <span>Projects</span>
            <span className="ml-auto text-zinc-500 dark:text-zinc-600">{regularProjects.length}</span>
            {onNewProject && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onNewProject();
                }}
                className="p-0.5 hover:bg-slate-200 dark:hover:bg-zinc-800 rounded"
              >
                <Plus size={12} />
              </button>
            )}
          </button>

          {projectsExpanded && (
            <div className="mt-1 space-y-0.5">
              {regularProjects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => onProjectSelect(project.id)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
                    selectedProjectId === project.id
                      ? "bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400"
                      : "text-zinc-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-900 hover:text-zinc-800 dark:hover:text-zinc-300"
                  }`}
                >
                  <Circle
                    size={8}
                    fill={project.color || "#6B7280"}
                    stroke="none"
                  />
                  <span className="truncate">{project.name}</span>
                </button>
              ))}
              {regularProjects.length === 0 && (
                <p className="px-2 py-2 text-xs text-zinc-500 dark:text-zinc-600">No projects yet</p>
              )}
            </div>
          )}
        </div>

        {/* Initiatives section */}
        <div className="px-2 mb-2">
          <button
            onClick={() => setInitiativesExpanded(!initiativesExpanded)}
            className="w-full flex items-center gap-1 px-2 py-1 text-xs font-medium text-zinc-500 hover:text-zinc-400 uppercase tracking-wider"
          >
            <ChevronRight
              size={12}
              className={`transition-transform ${initiativesExpanded ? "rotate-90" : ""}`}
            />
            <Rocket size={12} />
            <span>Initiatives</span>
            <span className="ml-auto text-zinc-500 dark:text-zinc-600">{initiatives.length}</span>
            {onNewInitiative && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onNewInitiative();
                }}
                className="p-0.5 hover:bg-slate-200 dark:hover:bg-zinc-800 rounded"
              >
                <Plus size={12} />
              </button>
            )}
          </button>

          {initiativesExpanded && (
            <div className="mt-1 space-y-0.5">
              {initiatives.map((initiative) => (
                <button
                  key={initiative.id}
                  onClick={() => onInitiativeSelect(initiative.id)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
                    selectedInitiativeId === initiative.id
                      ? "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400"
                      : "text-zinc-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-900 hover:text-zinc-800 dark:hover:text-zinc-300"
                  }`}
                >
                  <Rocket size={12} style={{ color: initiative.color || "#6B7280" }} />
                  <span className="truncate">{initiative.name}</span>
                </button>
              ))}
              {initiatives.length === 0 && (
                <p className="px-2 py-2 text-xs text-zinc-500 dark:text-zinc-600">No initiatives yet</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-2 py-2 border-t border-slate-200 dark:border-zinc-800">
        <button className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-900 rounded-md transition-colors">
          <Settings size={14} />
          <span>Settings</span>
        </button>
      </div>
    </div>
  );
}
