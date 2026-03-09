// Notion Sync Setup Wizard
// Step-by-step: pick database → field mapping → filter → target project → save

import { useState, useMemo } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Database,
  Search,
  Loader2,
} from "lucide-react";
import { Button } from "../../components/ui";
import {
  useNotionDatabases,
  useNotionDatabaseSchema,
  useNotionPreview,
  useCreateSyncConfig,
} from "../../hooks/useNotion";
import { useProjects } from "../../hooks/work";
import { NotionFieldMapper } from "./NotionFieldMapper";
import type {
  NotionDatabaseInfo,
  FieldMappingEntry,
  CreateSyncConfig,
} from "../../lib/notion/types";

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

type Step = "database" | "mapping" | "project" | "review";

export function NotionSyncSetup({ onClose, onSaved }: Props) {
  const [step, setStep] = useState<Step>("database");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDb, setSelectedDb] = useState<NotionDatabaseInfo | null>(null);
  const [configName, setConfigName] = useState("");
  const [fieldMapping, setFieldMapping] = useState<
    Record<string, FieldMappingEntry | string>
  >({});
  const [filterJson, setFilterJson] = useState("");
  const [targetProjectId, setTargetProjectId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: databases = [], isLoading: loadingDbs } =
    useNotionDatabases(searchQuery);
  const { data: schema, isLoading: loadingSchema } =
    useNotionDatabaseSchema(selectedDb?.id ?? null);
  const { data: projects = [] } = useProjects();
  const createConfig = useCreateSyncConfig();

  // Parse filter JSON
  const parsedFilter = useMemo(() => {
    if (!filterJson.trim()) return undefined;
    try {
      return JSON.parse(filterJson);
    } catch {
      return undefined;
    }
  }, [filterJson]);

  // Preview with current filter
  const { data: preview = [] } = useNotionPreview(
    step === "review" ? selectedDb?.id ?? null : null,
    parsedFilter
  );

  // Get statuses for the selected project (for value mapping)
  const selectedProject = projects.find((p) => p.id === targetProjectId);
  const projectStatuses = useMemo(
    () =>
      (selectedProject as any)?.statuses?.map((s: any) => ({
        id: s.id,
        name: s.name,
      })) ?? [],
    [selectedProject]
  );

  const handleSelectDb = (db: NotionDatabaseInfo) => {
    setSelectedDb(db);
    setConfigName(db.title);
    setStep("mapping");
  };

  const handleSave = async () => {
    if (!selectedDb || !targetProjectId) return;

    setError(null);
    try {
      const data: CreateSyncConfig = {
        name: configName || selectedDb.title,
        notion_database_id: selectedDb.id,
        target_project_id: targetProjectId,
        field_mapping: fieldMapping,
        filter: parsedFilter,
      };
      await createConfig.mutateAsync(data);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          {step !== "database" && (
            <button
              onClick={() => {
                const steps: Step[] = [
                  "database",
                  "mapping",
                  "project",
                  "review",
                ];
                const idx = steps.indexOf(step);
                if (idx > 0) setStep(steps[idx - 1]);
              }}
              className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            New Notion Sync
          </h2>
        </div>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 text-sm"
        >
          Cancel
        </button>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 px-4 py-2 bg-zinc-50 dark:bg-zinc-900 text-xs text-zinc-500">
        {(["database", "mapping", "project", "review"] as Step[]).map(
          (s, i) => (
            <span
              key={s}
              className={`${
                s === step
                  ? "text-brand-primary font-semibold"
                  : steps.indexOf(step) > i
                  ? "text-zinc-700 dark:text-zinc-300"
                  : ""
              }`}
            >
              {i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
              {i < 3 && <span className="ml-2 text-zinc-300">→</span>}
            </span>
          )
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {step === "database" && (
          <DatabaseStep
            databases={databases}
            loading={loadingDbs}
            searchQuery={searchQuery}
            onSearch={setSearchQuery}
            onSelect={handleSelectDb}
          />
        )}

        {step === "mapping" && schema && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Config Name
              </label>
              <input
                type="text"
                value={configName}
                onChange={(e) => setConfigName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                placeholder="e.g., ThinkVAL Tasks DB"
              />
            </div>

            <div>
              <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                Map Fields
              </h3>
              <p className="text-xs text-zinc-500 mb-3">
                Connect Notion properties to Work task fields. Only mapped fields
                will sync.
              </p>
              <NotionFieldMapper
                notionProperties={schema.properties}
                initialMapping={fieldMapping}
                workStatuses={projectStatuses}
                onChange={setFieldMapping}
              />
            </div>

            <div className="flex justify-end">
              <Button
                icon={ArrowRight}
                onClick={() => setStep("project")}
                disabled={Object.keys(fieldMapping).length === 0}
              >
                Next: Target Project
              </Button>
            </div>
          </div>
        )}

        {step === "mapping" && loadingSchema && (
          <div className="flex items-center justify-center py-12 text-zinc-500">
            <Loader2 size={20} className="animate-spin mr-2" />
            Loading schema...
          </div>
        )}

        {step === "project" && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Target Project
              </label>
              <p className="text-xs text-zinc-500 mb-2">
                Synced cards will be created as tasks in this project.
              </p>
              <select
                value={targetProjectId}
                onChange={(e) => setTargetProjectId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
              >
                <option value="">Select a project...</option>
                {projects
                  .filter((p) => !p.archived_at)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Filter (optional)
              </label>
              <p className="text-xs text-zinc-500 mb-2">
                Notion API filter JSON. Leave empty to sync all cards.
              </p>
              <textarea
                value={filterJson}
                onChange={(e) => setFilterJson(e.target.value)}
                rows={6}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                placeholder='{"property": "Status", "status": {"does_not_equal": "Done"}}'
              />
              {filterJson && !parsedFilter && (
                <p className="text-xs text-red-500 mt-1">Invalid JSON</p>
              )}
            </div>

            <div className="flex justify-end">
              <Button
                icon={ArrowRight}
                onClick={() => setStep("review")}
                disabled={!targetProjectId}
              >
                Next: Review
              </Button>
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              Review Configuration
            </h3>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500">Name</span>
                <span className="text-zinc-900 dark:text-zinc-100">
                  {configName}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500">Database</span>
                <span className="text-zinc-900 dark:text-zinc-100">
                  {selectedDb?.title}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500">Target Project</span>
                <span className="text-zinc-900 dark:text-zinc-100">
                  {projects.find((p) => p.id === targetProjectId)?.name}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500">Fields Mapped</span>
                <span className="text-zinc-900 dark:text-zinc-100">
                  {Object.keys(fieldMapping).length}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500">Filter</span>
                <span className="text-zinc-900 dark:text-zinc-100">
                  {parsedFilter ? "Custom" : "None (all cards)"}
                </span>
              </div>
            </div>

            {/* Preview */}
            {preview.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
                  Preview ({preview.length} most recent cards)
                </h4>
                <div className="space-y-1">
                  {preview.map((card) => (
                    <div
                      key={card.notion_page_id}
                      className="px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700"
                    >
                      {card.title}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setStep("project")}>
                Back
              </Button>
              <Button
                icon={Check}
                onClick={handleSave}
                loading={createConfig.isPending}
              >
                Create Sync
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Step indicator helper
const steps: Step[] = ["database", "mapping", "project", "review"];

// Database selection sub-component
function DatabaseStep({
  databases,
  loading,
  searchQuery,
  onSearch,
  onSelect,
}: {
  databases: NotionDatabaseInfo[];
  loading: boolean;
  searchQuery: string;
  onSearch: (q: string) => void;
  onSelect: (db: NotionDatabaseInfo) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search Notion databases..."
          className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
          autoFocus
        />
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8 text-zinc-500">
          <Loader2 size={20} className="animate-spin mr-2" />
          Searching...
        </div>
      )}

      {!loading && databases.length === 0 && (
        <div className="text-center py-8 text-zinc-500 text-sm">
          No databases found. Make sure you've shared databases with your Notion
          integration.
        </div>
      )}

      <div className="space-y-1">
        {databases.map((db) => (
          <button
            key={db.id}
            onClick={() => onSelect(db)}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 transition-colors text-left"
          >
            <Database size={18} className="text-zinc-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                {db.title}
              </div>
              <div className="text-xs text-zinc-500 truncate">{db.id}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
