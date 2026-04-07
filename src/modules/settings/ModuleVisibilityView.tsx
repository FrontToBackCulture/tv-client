// src/modules/settings/ModuleVisibilityView.tsx
// Settings view to toggle module visibility in the sidebar

import { useModuleVisibilityStore } from "../../stores/moduleVisibilityStore";

interface ModuleInfo {
  id: string;
  label: string;
  description: string;
}

const allModules: ModuleInfo[] = [
  { id: "library", label: "Library", description: "Knowledge base content and documents" },
  { id: "projects", label: "Projects", description: "Tasks, CRM, workspaces — unified project hub" },
  { id: "domains", label: "Domains", description: "VAL client domains and data" },
  { id: "analytics", label: "Analytics", description: "GA4 usage analytics for platform and website" },
  { id: "metadata", label: "Metadata", description: "Reference data — companies, contacts, lookup values" },
  { id: "work", label: "Work", description: "Task board and work tracking" },
  { id: "inbox", label: "Inbox", description: "Email inbox and triage" },
  { id: "calendar", label: "Calendar", description: "Calendar and events" },
  { id: "crm", label: "CRM", description: "Pipeline, directory, and client management" },
  { id: "prospecting", label: "Outbound", description: "Find prospects, draft emails, track outreach" },
  { id: "email", label: "EDM", description: "Email campaigns and marketing" },
  { id: "blog", label: "Blog", description: "Blog article management" },
  { id: "gallery", label: "Gallery", description: "Media gallery and reports" },
  { id: "portal", label: "Portal", description: "Client portal management" },
  { id: "skills", label: "Skills", description: "Skill registry, catalog, and prompt builder" },
  { id: "product", label: "Product", description: "Product documentation" },
  { id: "scheduler", label: "Scheduler", description: "Task scheduler" },
  { id: "repos", label: "Repos", description: "Repository management" },
  { id: "s3browser", label: "S3 Browser", description: "Browse and manage S3 buckets" },
];

export function ModuleVisibilityView() {
  const hiddenModules = useModuleVisibilityStore((s) => s.hiddenModules);
  const toggleModule = useModuleVisibilityStore((s) => s.toggleModule);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Modules</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Toggle which modules appear in the sidebar.
        </p>
      </div>

      <div className="space-y-1">
        {allModules.map((mod) => {
          const visible = !hiddenModules.includes(mod.id);
          return (
            <label
              key={mod.id}
              className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{mod.label}</div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">{mod.description}</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={visible}
                onClick={() => toggleModule(mod.id)}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ml-3 ${
                  visible ? "bg-teal-600" : "bg-zinc-300 dark:bg-zinc-600"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white dark:bg-zinc-200 transition-transform ${
                    visible ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </button>
            </label>
          );
        })}
      </div>
    </div>
  );
}
