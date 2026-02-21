// src/modules/product/DataModelTabView.tsx
// Data Model tab: browse entity schemas, scan domains for table presence,
// view structural conformance (columns + order) against lab reference.

import { useState, useMemo } from "react";
import {
  Search,
  X,
  ChevronRight,
  ChevronDown,
  Database,
  RefreshCw,
  FileText,
  FileJson,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  Bookmark,
  Columns3,
  ArrowUpDown,
  Minus,
  Plus,
  Layers,
  Bot,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { useSidePanelStore } from "../../stores/sidePanelStore";
import { useRepository } from "../../stores/repositoryStore";
import {
  useDomainModelEntities,
  useDomainModelFile,
  useScanDomainModelTable,
  useGenerateSchemaMd,
} from "../../hooks/val-sync";
import type { EntityInfo } from "../../hooks/val-sync";
import { SchemaFieldsGrid } from "./SchemaFieldsGrid";
import type { SchemaFile } from "./SchemaFieldsGrid";
import { FieldMasterGrid } from "./FieldMasterGrid";

// ============================================================================
// Types for domains.json / categoricals.json (structural conformance)
// ============================================================================

interface ColumnDiff {
  column: string;
  display_name: string;
  ref_position?: number;
  domain_position?: number;
  ref_index?: number;
  domain_index?: number;
}

interface StructuralConformance {
  status: string; // "reference" | "aligned" | "diverged"
  ref_columns: number;
  domain_columns: number;
  missing: ColumnDiff[];
  extra: ColumnDiff[];
  order_mismatches: ColumnDiff[];
}

interface DomainEntry {
  domain: string;
  status: string;
  records: number | null;
  first_record: string | null;
  latest_record: string | null;
  source_systems: string[];
  brands: string[];
  notes?: string;
  conformance?: StructuralConformance;
}

interface DomainsFile {
  table_name: string;
  display_name: string;
  fuel_stage: string;
  model: string;
  last_scanned: string;
  reference_domain?: string;
  summary: {
    total_domains: number;
    active_domains: number;
    empty_domains: number;
    unknown_domains: number;
    total_records: number;
  };
  domains: DomainEntry[];
}

interface CategoricalValue {
  value: string;
  count: number;
}

interface CategoricalField {
  column: string;
  field_id?: number;
  group?: string;
  by_domain: Record<string, CategoricalValue[]>;
}

interface CategoricalsFile {
  table_name: string;
  display_name: string;
  last_scanned: string;
  fields: Record<string, CategoricalField>;
}

// ============================================================================
// Selection state
// ============================================================================

type Selection =
  | { kind: "entity"; entity: string; model: string }
  | { kind: "field-master" };

// ============================================================================
// Component
// ============================================================================

export function DataModelTabView() {
  const { activeRepository } = useRepository();
  const entitiesPath = activeRepository
    ? `${activeRepository.path}/0_Platform/architecture/domain-model/entities`
    : null;

  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [expandedEntities, setExpandedEntities] = useState<Set<string>>(new Set());
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set());
  const [detailTab, setDetailTab] = useState<"schema" | "domains" | "categoricals">("schema");

  // Queries
  const entitiesQuery = useDomainModelEntities(entitiesPath);
  const entities = entitiesQuery.data ?? [];
  const scanMutation = useScanDomainModelTable();
  const generateMdMutation = useGenerateSchemaMd();

  // Derive entity selection helpers
  const entitySelection = selection?.kind === "entity" ? selection : null;
  const isFieldMaster = selection?.kind === "field-master";

  // Derive file paths for selected model
  const selectedModelPath = useMemo(() => {
    if (!entitySelection || !entitiesPath) return null;
    return `${entitiesPath}/${entitySelection.entity}/${entitySelection.model}`;
  }, [entitySelection, entitiesPath]);

  const domainsFilePath = selectedModelPath ? `${selectedModelPath}/domains.json` : null;
  const categoricalsFilePath = selectedModelPath ? `${selectedModelPath}/categoricals.json` : null;

  const domainsQuery = useDomainModelFile<DomainsFile>(domainsFilePath);
  const categoricalsQuery = useDomainModelFile<CategoricalsFile>(categoricalsFilePath);

  const domainsData = domainsQuery.data ?? null;
  const categoricalsData = categoricalsQuery.data ?? null;

  const schemaFilePath = selectedModelPath ? `${selectedModelPath}/schema.json` : null;
  const schemaQuery = useDomainModelFile<SchemaFile>(schemaFilePath);
  const schemaData = schemaQuery.data ?? null;

  // Get selected model info
  const selectedModelInfo = useMemo(() => {
    if (!entitySelection) return null;
    const entity = entities.find((e) => e.name === entitySelection.entity);
    return entity?.models.find((m) => m.name === entitySelection.model) ?? null;
  }, [entitySelection, entities]);

  // Filter entities by search
  const searchLower = search.toLowerCase();
  const filteredEntities = useMemo(
    () =>
      search
        ? entities.filter((e) => e.name.toLowerCase().includes(searchLower))
        : entities,
    [entities, searchLower, search]
  );

  // Toggle entity expansion in sidebar
  const toggleEntity = (name: string) => {
    setExpandedEntities((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // Toggle categorical field expansion
  const toggleField = (name: string) => {
    setExpandedFields((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // Toggle domain row expansion (for conformance details)
  const toggleDomain = (domain: string) => {
    setExpandedDomains((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  };

  // Handle scan
  const handleScan = () => {
    if (!selectedModelPath || !selectedModelInfo?.has_schema_json) return;
    setExpandedDomains(new Set());
    scanMutation.mutate({
      schemaPath: `${selectedModelPath}/schema.json`,
    });
  };

  // Handle generate schema.md
  const handleGenerateMd = () => {
    if (!selectedModelPath || !selectedModelInfo?.has_schema_json) return;
    generateMdMutation.mutate(`${selectedModelPath}/schema.json`);
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* -- Sidebar -- */}
      <div className="w-64 flex-shrink-0 border-r border-zinc-200 dark:border-zinc-800 flex flex-col bg-zinc-50 dark:bg-zinc-900/50">
        {/* Search */}
        <div className="p-3 border-b border-zinc-200 dark:border-zinc-800">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400"
            />
            <input
              type="text"
              placeholder="Search entities..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 text-sm rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Entity list */}
        <div className="flex-1 overflow-y-auto py-1">
          {/* All Fields (field master) */}
          <button
            onClick={() => setSelection({ kind: "field-master" })}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors border-b border-zinc-200 dark:border-zinc-800",
              isFieldMaster
                ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            )}
          >
            <Layers size={14} className="flex-shrink-0" />
            <span className="font-medium">All Fields</span>
          </button>

          {entitiesQuery.isLoading && (
            <div className="px-3 py-4 text-sm text-zinc-400 text-center">
              Loading...
            </div>
          )}

          {!entitiesQuery.isLoading && filteredEntities.length === 0 && (
            <div className="px-3 py-4 text-sm text-zinc-400 text-center">
              {search ? "No matching entities" : "No entities found"}
            </div>
          )}

          {filteredEntities.map((entity) => (
            <EntitySidebarItem
              key={entity.name}
              entity={entity}
              expanded={expandedEntities.has(entity.name)}
              selectedModel={
                entitySelection?.entity === entity.name ? entitySelection.model : null
              }
              onToggle={() => toggleEntity(entity.name)}
              onSelectModel={(model) => {
                setSelection({ kind: "entity", entity: entity.name, model });
                setExpandedDomains(new Set());
                if (!expandedEntities.has(entity.name)) {
                  toggleEntity(entity.name);
                }
              }}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="px-3 py-2 border-t border-zinc-200 dark:border-zinc-800 text-xs text-zinc-400">
          {entities.length} entities
        </div>
      </div>

      {/* -- Content -- */}
      <div className="flex-1 overflow-y-auto">
        {!selection && (
          <div className="flex items-center justify-center h-full text-zinc-400 text-sm">
            Select an entity model from the sidebar
          </div>
        )}

        {isFieldMaster && entitiesPath && (
          <FieldMasterGrid entitiesPath={entitiesPath} />
        )}

        {entitySelection && selectedModelInfo && (
          <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  {entitySelection.entity}{" "}
                  <span className="text-zinc-400 font-normal">/</span>{" "}
                  <span className="text-blue-600 dark:text-blue-400 uppercase">
                    {entitySelection.model}
                  </span>
                </h2>
                {selectedModelInfo.display_name && (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-0.5">
                    {selectedModelInfo.display_name}
                  </p>
                )}
                {selectedModelInfo.table_name && (
                  <p className="text-xs text-zinc-400 mt-0.5 font-mono">
                    {selectedModelInfo.table_name}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <FileIndicator label="Schema" exists={selectedModelInfo.has_schema_json} icon="json" filePath={selectedModelPath ? `${selectedModelPath}/schema.json` : undefined} />
                <FileIndicator label="Docs" exists={selectedModelInfo.has_schema_md} icon="md" filePath={selectedModelPath ? `${selectedModelPath}/schema.md` : undefined} />
                <FileIndicator label="SQL" exists={selectedModelInfo.has_sql} icon="md" filePath={selectedModelPath ? `${selectedModelPath}/sql.md` : undefined} />
                <FileIndicator label="Workflow" exists={selectedModelInfo.has_workflow} icon="md" filePath={selectedModelPath ? `${selectedModelPath}/workflow.md` : undefined} />
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-5 gap-3">
              {selectedModelInfo.field_count != null && (
                <StatCard label="Fields" value={selectedModelInfo.field_count} />
              )}
              {selectedModelInfo.categorical_count != null && (
                <StatCard label="Categoricals" value={selectedModelInfo.categorical_count} accent="blue" />
              )}
              {domainsData && (
                <>
                  <StatCard label="Domains" value={domainsData.summary.total_domains} />
                  <StatCard label="Active" value={domainsData.summary.active_domains} accent="green" />
                  <StatCard
                    label="Records"
                    value={domainsData.summary.total_records.toLocaleString()}
                  />
                </>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleScan}
                disabled={!selectedModelInfo.has_schema_json || scanMutation.isPending}
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                  selectedModelInfo.has_schema_json && !scanMutation.isPending
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "bg-zinc-200 dark:bg-zinc-700 text-zinc-400 cursor-not-allowed"
                )}
              >
                {scanMutation.isPending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                {scanMutation.isPending ? "Scanning..." : "Scan Domains"}
              </button>

              {selectedModelInfo.has_schema_json && (
                <button
                  onClick={handleGenerateMd}
                  disabled={generateMdMutation.isPending}
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  <FileText size={14} />
                  {generateMdMutation.isPending ? "Generating..." : "Generate schema.md"}
                </button>
              )}

              {scanMutation.isSuccess && (
                <span className="text-sm text-green-600 dark:text-green-400">
                  Found {scanMutation.data.domains_found} domains (
                  {scanMutation.data.active_domains} active) in{" "}
                  {(scanMutation.data.duration_ms / 1000).toFixed(1)}s
                </span>
              )}

              {scanMutation.isSuccess && scanMutation.data.errors.length > 0 && (
                <span className="text-sm text-amber-600 dark:text-amber-400">
                  {scanMutation.data.errors.length} errors
                </span>
              )}

              {scanMutation.isError && (
                <span className="text-sm text-red-600 dark:text-red-400">
                  Scan failed: {String(scanMutation.error)}
                </span>
              )}

              {!selectedModelInfo.has_schema_json && (
                <span className="text-sm text-zinc-400">
                  No schema.json — create one to enable scanning
                </span>
              )}
            </div>

            {/* Detail tabs */}
            <div className="flex items-center gap-1 border-b border-zinc-200 dark:border-zinc-700 mb-4">
              {([
                { key: "schema" as const, label: "Schema", count: schemaData?.fields.length },
                { key: "domains" as const, label: "Domains", count: domainsData?.domains.length },
                { key: "categoricals" as const, label: "Categoricals", count: categoricalsData ? Object.keys(categoricalsData.fields).length : undefined },
              ]).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setDetailTab(tab.key)}
                  className={cn(
                    "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                    detailTab === tab.key
                      ? "border-teal-500 text-teal-600 dark:text-teal-400"
                      : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                  )}
                >
                  {tab.label}
                  {tab.count != null && (
                    <span className="ml-1.5 text-xs text-zinc-400">({tab.count})</span>
                  )}
                </button>
              ))}
            </div>

            {/* Schema tab */}
            {detailTab === "schema" && schemaData && schemaFilePath && (
              <SchemaFieldsGrid
                schemaData={schemaData}
                schemaFilePath={schemaFilePath}
              />
            )}

            {/* Domains tab */}
            {detailTab === "domains" && (
              <>
                {domainsData && domainsData.domains.length > 0 ? (
                  <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
                          <th className="w-6 px-1 py-2" />
                          <th className="text-left px-3 py-2 font-medium text-zinc-500">Domain</th>
                          <th className="text-left px-3 py-2 font-medium text-zinc-500">Status</th>
                          <th className="text-right px-3 py-2 font-medium text-zinc-500">Records</th>
                          <th className="text-left px-3 py-2 font-medium text-zinc-500">Date Range</th>
                          <th className="text-left px-3 py-2 font-medium text-zinc-500">Conformance</th>
                          <th className="text-left px-3 py-2 font-medium text-zinc-500">Source Systems</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {domainsData.domains.map((d) => {
                          const conf = d.conformance;
                          const hasConformanceDetails =
                            conf &&
                            conf.status === "diverged" &&
                            ((conf.missing?.length ?? 0) > 0 ||
                              (conf.extra?.length ?? 0) > 0 ||
                              (conf.order_mismatches?.length ?? 0) > 0);
                          const isExpanded = expandedDomains.has(d.domain);

                          return (
                            <DomainRow
                              key={d.domain}
                              domain={d}
                              hasDetails={!!hasConformanceDetails}
                              isExpanded={isExpanded}
                              onToggle={() => toggleDomain(d.domain)}
                            />
                          );
                        })}
                      </tbody>
                    </table>
                    {domainsData.reference_domain && (
                      <div className="px-3 py-2 text-xs text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 border-t border-zinc-200 dark:border-zinc-700">
                        Reference: {domainsData.reference_domain}
                      </div>
                    )}
                  </div>
                ) : (
                  !domainsQuery.isLoading && (
                    <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-8 text-center text-zinc-400 text-sm">
                      No domain data yet. Click "Scan Domains" to discover which
                      domains have this table.
                    </div>
                  )
                )}
              </>
            )}

            {/* Categoricals tab */}
            {detailTab === "categoricals" && (
              <>
                {categoricalsData && Object.keys(categoricalsData.fields).length > 0 ? (
                  <div className="space-y-1">
                    {Object.entries(categoricalsData.fields).map(
                      ([fieldName, field]) => (
                        <CategoricalFieldRow
                          key={fieldName}
                          fieldName={fieldName}
                          field={field}
                          expanded={expandedFields.has(fieldName)}
                          onToggle={() => toggleField(fieldName)}
                        />
                      )
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-8 text-center text-zinc-400 text-sm">
                    No categorical data yet. Run "Scan Domains" to collect categorical values.
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Domain row with expandable conformance details
// ============================================================================

function DomainRow({
  domain: d,
  hasDetails,
  isExpanded,
  onToggle,
}: {
  domain: DomainEntry;
  hasDetails: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className={cn(
          "hover:bg-zinc-50 dark:hover:bg-zinc-800/30",
          d.conformance?.status === "reference" && "bg-blue-50/50 dark:bg-blue-900/10",
          hasDetails && "cursor-pointer"
        )}
        onClick={hasDetails ? onToggle : undefined}
      >
        <td className="px-1 py-2 text-center">
          {hasDetails && (
            isExpanded
              ? <ChevronDown size={14} className="text-zinc-400 mx-auto" />
              : <ChevronRight size={14} className="text-zinc-400 mx-auto" />
          )}
        </td>
        <td className="px-3 py-2 font-mono font-medium text-zinc-900 dark:text-zinc-100">
          <span className="flex items-center gap-1.5">
            {d.conformance?.status === "reference" && (
              <Bookmark size={12} className="text-blue-500 flex-shrink-0" />
            )}
            {d.domain}
          </span>
        </td>
        <td className="px-3 py-2">
          <StatusBadge status={d.status} />
        </td>
        <td className="px-3 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
          {d.records != null ? d.records.toLocaleString() : "\u2014"}
        </td>
        <td className="px-3 py-2 text-zinc-500 text-xs">
          {d.first_record && d.latest_record
            ? `${d.first_record} \u2192 ${d.latest_record}`
            : "\u2014"}
        </td>
        <td className="px-3 py-2">
          <ConformanceBadge conformance={d.conformance} />
        </td>
        <td className="px-3 py-2 text-zinc-500 text-xs max-w-40 truncate">
          {(d.source_systems?.length ?? 0) > 0
            ? d.source_systems.join(", ")
            : "\u2014"}
        </td>
      </tr>

      {/* Expanded conformance details accordion */}
      {isExpanded && hasDetails && d.conformance && (
        <tr>
          <td colSpan={7} className="p-0">
            <ConformanceDetails conformance={d.conformance} domainName={d.domain} />
          </td>
        </tr>
      )}
    </>
  );
}

// ============================================================================
// Conformance details panel (accordion content)
// ============================================================================

function ConformanceDetails({
  conformance,
  domainName,
}: {
  conformance: StructuralConformance;
  domainName: string;
}) {
  return (
    <div className="bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-200 dark:border-zinc-700 px-6 py-4 space-y-4">
      {/* Summary line */}
      <div className="flex items-center gap-4 text-xs text-zinc-500">
        <span>
          <span className="font-medium text-zinc-700 dark:text-zinc-300">{domainName}</span>
          {" "}has {conformance.domain_columns} columns vs {conformance.ref_columns} in reference
        </span>
      </div>

      {/* Missing columns (in ref but not in domain) */}
      {(conformance.missing?.length ?? 0) > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Minus size={14} className="text-red-500" />
            <span className="text-xs font-semibold text-red-600 dark:text-red-400">
              Missing Columns ({conformance.missing.length})
            </span>
            <span className="text-xs text-zinc-400">
              In reference but not in {domainName}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(conformance.missing ?? []).map((col) => (
              <ColumnDiffChip key={col.column} col={col} color="red" />
            ))}
          </div>
        </div>
      )}

      {/* Extra columns (in domain but not in ref) */}
      {(conformance.extra?.length ?? 0) > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Plus size={14} className="text-amber-500" />
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
              Extra Columns ({conformance.extra.length})
            </span>
            <span className="text-xs text-zinc-400">
              In {domainName} but not in reference
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(conformance.extra ?? []).map((col) => (
              <ColumnDiffChip key={col.column} col={col} color="amber" />
            ))}
          </div>
        </div>
      )}

      {/* Order mismatches */}
      {(conformance.order_mismatches?.length ?? 0) > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <ArrowUpDown size={14} className="text-blue-500" />
            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
              Order Mismatches ({conformance.order_mismatches.length})
            </span>
            <span className="text-xs text-zinc-400">
              Same column, different position
            </span>
          </div>
          <div className="border border-zinc-200 dark:border-zinc-700 rounded-md overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-zinc-100 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700">
                  <th className="text-left px-3 py-1.5 font-medium text-zinc-500">Column</th>
                  <th className="text-left px-3 py-1.5 font-medium text-zinc-500">DB Column</th>
                  <th className="text-center px-3 py-1.5 font-medium text-zinc-500">Ref Position</th>
                  <th className="text-center px-3 py-1.5 font-medium text-zinc-500">Domain Position</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {(conformance.order_mismatches ?? []).map((col) => (
                  <tr key={col.column}>
                    <td className="px-3 py-1.5 font-medium text-zinc-700 dark:text-zinc-300">
                      {col.display_name && col.display_name !== col.column ? col.display_name : "\u2014"}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-zinc-400">
                      {col.column}
                    </td>
                    <td className="px-3 py-1.5 text-center tabular-nums text-zinc-500">
                      {(col.ref_index ?? 0) + 1}
                    </td>
                    <td className="px-3 py-1.5 text-center tabular-nums text-zinc-500">
                      {(col.domain_index ?? 0) + 1}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function EntitySidebarItem({
  entity,
  expanded,
  selectedModel,
  onToggle,
  onSelectModel,
}: {
  entity: EntityInfo;
  expanded: boolean;
  selectedModel: string | null;
  onToggle: () => void;
  onSelectModel: (model: string) => void;
}) {
  const totalRecords = entity.models.reduce(
    (sum, m) => sum + (m.total_records ?? 0),
    0
  );

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
      >
        {expanded ? (
          <ChevronDown size={14} className="text-zinc-400 flex-shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-zinc-400 flex-shrink-0" />
        )}
        <Database size={14} className="text-zinc-400 flex-shrink-0" />
        <span className="text-zinc-900 dark:text-zinc-100 font-medium truncate">
          {entity.name}
        </span>
        {totalRecords > 0 && (
          <span className="ml-auto text-xs text-zinc-400 tabular-nums">
            {totalRecords > 1_000_000
              ? `${(totalRecords / 1_000_000).toFixed(1)}M`
              : totalRecords > 1_000
                ? `${(totalRecords / 1_000).toFixed(0)}K`
                : totalRecords}
          </span>
        )}
      </button>

      {expanded &&
        entity.models.map((model) => (
          <button
            key={model.name}
            onClick={() => onSelectModel(model.name)}
            className={cn(
              "w-full flex items-start gap-2 pl-10 pr-3 py-1.5 text-sm transition-colors",
              selectedModel === model.name
                ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            )}
          >
            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="uppercase text-xs font-mono font-medium">
                  {model.name}
                </span>
                {model.has_schema_json && (
                  <FileJson size={12} className="text-blue-400 flex-shrink-0" />
                )}
                {model.ai_package && (
                  <Bot size={12} className="text-violet-500 flex-shrink-0" />
                )}
                {model.has_domains && (
                  <span className="ml-auto text-xs text-zinc-400">
                    {model.active_domain_count ?? 0}d
                  </span>
                )}
                {!model.has_domains && model.has_schema_json && (
                  <span className="ml-auto text-xs text-zinc-300">
                    {model.categorical_count ?? 0}c
                  </span>
                )}
              </div>
              {(model.table_name || model.display_name) && (
                <span
                  className="text-[10px] leading-tight opacity-50 font-normal truncate block max-w-full"
                  title={[model.table_name, model.display_name].filter(Boolean).join(" · ")}
                >
                  {model.table_name}
                  {model.table_name && model.display_name && " · "}
                  {model.display_name}
                </span>
              )}
            </div>
          </button>
        ))}
    </div>
  );
}

function FileIndicator({
  label,
  exists,
  icon,
  filePath,
}: {
  label: string;
  exists: boolean;
  icon?: "json" | "md";
  filePath?: string;
}) {
  const { openPanel } = useSidePanelStore();
  const Icon = icon === "json" ? FileJson : FileText;
  const clickable = exists && filePath;
  return (
    <span
      onClick={clickable ? () => openPanel(filePath, label) : undefined}
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full",
        exists
          ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"
          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400",
        clickable && "cursor-pointer hover:bg-green-100 dark:hover:bg-green-900/40"
      )}
    >
      <Icon size={10} />
      {label}
    </span>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: "green" | "blue";
}) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-3">
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      <div
        className={cn(
          "text-lg font-semibold tabular-nums",
          accent === "green"
            ? "text-green-600 dark:text-green-400"
            : accent === "blue"
              ? "text-blue-600 dark:text-blue-400"
              : "text-zinc-900 dark:text-zinc-100"
        )}
      >
        {value}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400",
    test: "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400",
    empty: "bg-zinc-100 dark:bg-zinc-800 text-zinc-500",
    not_found: "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 italic",
    unknown: "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400",
  };

  return (
    <span
      className={cn(
        "inline-block px-2 py-0.5 text-xs font-medium rounded-full",
        styles[status] ?? styles.unknown
      )}
    >
      {status}
    </span>
  );
}

function ConformanceBadge({ conformance }: { conformance?: StructuralConformance }) {
  if (!conformance) return <span className="text-zinc-300 text-xs">{"\u2014"}</span>;

  if (conformance.status === "reference") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
        <Bookmark size={10} />
        reference
        {conformance.ref_columns != null && (
          <span className="text-blue-400 dark:text-blue-500 ml-0.5">
            ({conformance.ref_columns}col)
          </span>
        )}
      </span>
    );
  }

  if (conformance.status === "aligned") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400">
        <ShieldCheck size={10} />
        aligned
        {conformance.domain_columns != null && (
          <span className="text-green-500 dark:text-green-600 ml-0.5">
            ({conformance.domain_columns}col)
          </span>
        )}
      </span>
    );
  }

  if (conformance.status === "diverged") {
    const parts: string[] = [];
    const missingCount = conformance.missing?.length ?? 0;
    const extraCount = conformance.extra?.length ?? 0;
    const orderCount = conformance.order_mismatches?.length ?? 0;
    if (missingCount > 0) parts.push(`-${missingCount}`);
    if (extraCount > 0) parts.push(`+${extraCount}`);
    if (orderCount > 0) parts.push(`~${orderCount}`);
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400">
        <ShieldAlert size={10} />
        diverged
        {parts.length > 0 && (
          <span className="text-amber-500 dark:text-amber-600 ml-0.5 font-mono">
            ({parts.join(" ")})
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400">
      <Columns3 size={10} />
      {conformance.status}
    </span>
  );
}

function ColumnDiffChip({ col, color }: { col: ColumnDiff; color: "red" | "amber" }) {
  const hasDisplayName = col.display_name && col.display_name !== col.column;
  const styles = {
    red: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300",
    amber: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300",
  };
  const subStyles = {
    red: "text-red-400 dark:text-red-500",
    amber: "text-amber-400 dark:text-amber-500",
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border", styles[color])}>
      {hasDisplayName ? (
        <>
          <span className="font-medium">{col.display_name}</span>
          <span className={cn("font-mono text-[10px]", subStyles[color])}>
            {col.column}
          </span>
        </>
      ) : (
        <span className="font-mono font-medium">{col.column}</span>
      )}
    </span>
  );
}

// ============================================================================
// Categorical field row (values only, no conformance)
// ============================================================================

function CategoricalFieldRow({
  fieldName,
  field,
  expanded,
  onToggle,
}: {
  fieldName: string;
  field: CategoricalField;
  expanded: boolean;
  onToggle: () => void;
}) {
  const domainCount = Object.keys(field.by_domain).length;

  return (
    <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
      >
        {expanded ? (
          <ChevronDown size={14} className="text-zinc-400" />
        ) : (
          <ChevronRight size={14} className="text-zinc-400" />
        )}
        <span className="font-medium text-zinc-900 dark:text-zinc-100">
          {fieldName}
        </span>
        <span className="text-xs text-zinc-400 font-mono">
          {field.column}
        </span>
        {field.group && (
          <span className="text-xs text-zinc-300 dark:text-zinc-600">
            {field.group}
          </span>
        )}
        <span className="ml-auto text-xs text-zinc-400">
          {domainCount} domains
        </span>
      </button>

      {expanded && (
        <div className="border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/30 px-3 py-2 text-sm">
          <div className="space-y-3">
            {Object.entries(field.by_domain)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([domain, values]) => (
                <div key={domain}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs font-medium text-zinc-500">
                      {domain}
                    </span>
                    <span className="text-xs text-zinc-300">
                      {values.length} values
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {values.map((v) => (
                      <span
                        key={v.value}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded border bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300"
                      >
                        {v.value}
                        <span className="text-zinc-400 tabular-nums">
                          ({v.count.toLocaleString()})
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
