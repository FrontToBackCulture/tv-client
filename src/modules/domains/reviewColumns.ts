// Unified column definitions for all review resource types

import React from "react";
import { ColDef, ColGroupDef, ValueFormatterParams, ValueGetterParams } from "ag-grid-community";
import type { ReviewResourceType, ReviewRow } from "./reviewTypes";
import {
  NameCellRenderer,
  StatusCellRenderer,
  ActionCellRenderer,
  DaysCellRenderer,
} from "./reviewGridRenderers";
import type { ClassificationValues } from "../../stores/classificationStore";
import { DatalistCellEditor } from "./DatalistCellEditor";

/** Renders the `tags` array (string[]) as zinc pill chips — one per value.
 *  Same chip styling as getTagStyle("tag") in reviewGridRenderers so the look
 *  matches the synthesized non-review summary view. */
function TagsChipsCell(params: { value: unknown }) {
  const tags = Array.isArray(params.value) ? params.value.filter(Boolean) : [];
  if (tags.length === 0) {
    return React.createElement("span", { className: "text-zinc-300 text-xs" }, "—");
  }
  return React.createElement(
    "div",
    { className: "flex flex-wrap items-center gap-1 py-1" },
    tags.map((t, i) =>
      React.createElement(
        "span",
        {
          key: `${i}-${String(t)}`,
          className:
            "px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
        },
        String(t),
      ),
    ),
  );
}

/** Teal chip renderer for Data Representation. Matches getTagStyle("dataType")
 *  in reviewGridRenderers.tsx and the Skills grid's `dataTypes` column so the
 *  same visual language is used wherever data-representation classification
 *  appears. Tables/queries/dashboards/workflows carry a single value per row;
 *  Skills carries an array — the per-value chip styling is identical. */
function DataRepresentationCell(params: { value: string | null }) {
  if (!params.value) return React.createElement("span", { className: "text-zinc-300 text-xs" }, "—");
  return React.createElement(
    "span",
    {
      className:
        "px-1.5 py-0.5 rounded text-[10px] font-medium bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400",
    },
    params.value,
  );
}

/** Date-time value formatter for timestamp columns */
function dateTimeFormatter(params: ValueFormatterParams): string {
  if (!params.value) return "-";
  try {
    const date = new Date(params.value);
    return date.toLocaleDateString("en-SG", { timeZone: "Asia/Singapore" }) + " " + date.toLocaleTimeString("en-SG", { timeZone: "Asia/Singapore", hour: "2-digit", minute: "2-digit" });
  } catch {
    return params.value;
  }
}

// ─── Column scope tagging ─────────────────────────────────────────────────────
// "common" = metadata aligned across skills + all 4 artifact tabs after the
// Layer 1 alignment migration (canonical column names in domain_artifacts +
// skills). "specific" = type-specific to artifacts (data classification,
// AI-generated summaries, sitemap, count/metric fields, scheduling, GA4).
// Used as headerClass on each column def — see ReviewGrid.tsx for the CSS.
const COMMON_HEADER_CLASS = "scope-common";
const SPECIFIC_HEADER_CLASS = "scope-specific";

const COMMON_REVIEW_FIELDS = new Set<string>([
  "name", "displayName", "description",
  "category", "subcategory",
  // dataCategory/dataSubCategory promoted to common — also present on skills.
  "dataCategory", "dataSubCategory",
  // dataType (Data Representation) — truly defines the data; common across all 5 types.
  "dataType",
  "usageStatus", // → status column post-Layer-1
  "tags", "solution", "action", "owner", "verified",
  // Audit (every type tracks when last edited).
  "updatedDate",
  // Identity / cross-cutting (every artifact has these)
  "domain",
  // Lab-only join column
  "deployedTo",
]);

function tagScopeArtifactCol(col: ColDef<ReviewRow> | ColGroupDef<ReviewRow>): ColDef<ReviewRow> | ColGroupDef<ReviewRow> {
  if ("children" in col && Array.isArray(col.children)) {
    return { ...col, children: col.children.map((c) => tagScopeArtifactCol(c as ColDef<ReviewRow> | ColGroupDef<ReviewRow>)) };
  }
  const c = col as ColDef<ReviewRow>;
  const field = (c.field as string | undefined) ?? (c.colId as string | undefined) ?? "";
  if (!field) return c;
  // Skip purely-identity columns to avoid noisy tinting.
  if (field === "id" || field === "folderName" || field === "folderPath" || field === "isStale") {
    return c;
  }
  const scopeClass = COMMON_REVIEW_FIELDS.has(field) ? COMMON_HEADER_CLASS : SPECIFIC_HEADER_CLASS;
  const existing = typeof c.headerClass === "string" ? c.headerClass : "";
  const merged = existing.includes(scopeClass) ? existing : `${existing} ${scopeClass}`.trim();
  return { ...c, headerClass: merged };
}

/** Domain column definition — used in cross-domain aggregation views */
const DOMAIN_COLUMN: ColDef<ReviewRow> = {
  field: "domain" as keyof ReviewRow,
  headerName: "Domain",
  width: 130,
  pinned: "left",
  filter: "agSetColumnFilter",
  enableRowGroup: true,
};

/** "Deployed To" column — shown when viewing a master domain (e.g., Lab).
 *  Renders one chip per client domain that has received this artifact via promote.
 *  Drift status colours the chip: green=in_sync, amber=drifted, red=missing,
 *  grey=unknown. When `onChipClick` is supplied, chips are clickable and
 *  open a diff modal showing master vs target definitions.
 *
 *  Uses a Set filter that splits the deployments array into per-domain entries,
 *  so ticking "koi" matches every artifact deployed to koi (alongside other
 *  targets) — same UX as the Skills `domain` column. */
function buildDeployedToColumn(
  onChipClick?: (targetDomain: string, resourceId: string, driftStatus: string) => void,
): ColDef<ReviewRow> {
  return {
    colId: "deployedTo",
    headerName: "Deployed To",
    minWidth: 220,
    flex: 1,
    valueGetter: (p) =>
      (p.data?.deployments ?? []).map((d) => d.target_domain).sort(),
    filter: "agSetColumnFilter",
    filterParams: {
      keyCreator: (p: { value: string[] | null | undefined }) => p.value ?? [],
      valueFormatter: (p: { value: string }) => p.value,
    },
    cellRenderer: (params: { data?: ReviewRow }) => {
      const deps = params.data?.deployments ?? [];
      if (!deps.length) {
        return React.createElement("span", { className: "text-xs text-zinc-300" }, "—");
      }
      // Drift intensity buckets, by total column changes (added+removed+changed).
      // Tuned against observed distribution for lab→clients: most drifted
      // tables have 1-3 changes; ≥11 indicates a wholesale schema rewrite.
      const colourFor = (
        status: string,
        added: number | null,
        removed: number | null,
        changed: number | null,
      ) => {
        switch (status) {
          case "in_sync":
            return "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
          case "drifted": {
            const total = (added ?? 0) + (removed ?? 0) + (changed ?? 0);
            if (total === 0 || total <= 3) {
              // Minor — light yellow, easy to scan past
              return "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300";
            }
            if (total <= 10) {
              // Moderate — amber, clearly drifted
              return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
            }
            // Major — orange, wholesale schema differences
            return "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300";
          }
          case "missing":
            return "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300";
          default:
            return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
        }
      };
      // Use `id` so this works for every resource type — for tables it
       // equals tableName, for queries/workflows/dashboards it's the
       // numeric VAL id matching artifact_deployments.master_resource_id.
       // (Old code used `name`, which is the display name for non-tables.)
      const resourceId = params.data?.id
        ?? params.data?.name
        ?? params.data?.folderName
        ?? "";
      return React.createElement(
        "span",
        { className: "flex flex-wrap items-center gap-1 py-1" },
        deps
          .slice()
          .sort((a, b) => a.target_domain.localeCompare(b.target_domain))
          .map((d) => {
            const chipClass =
              `px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${colourFor(d.drift_status, d.drift_added, d.drift_removed, d.drift_changed)}` +
              (onChipClick ? " cursor-pointer hover:opacity-80" : "");
            // Build tooltip with the full drift breakdown when present —
            // lets the user see severity at a glance without opening the diff.
            const breakdown = [
              d.drift_added ? `+${d.drift_added}` : null,
              d.drift_removed ? `-${d.drift_removed}` : null,
              d.drift_changed ? `~${d.drift_changed}` : null,
            ].filter(Boolean).join(" ");
            const title =
              `${d.target_domain} · ${d.drift_status}` +
              (breakdown ? ` (${breakdown})` : "") +
              (d.last_deployed_at ? ` · ${d.last_deployed_at}` : "") +
              (onChipClick ? " — click to diff" : "");
            return React.createElement(
              onChipClick ? "button" : "span",
              {
                key: d.target_domain,
                type: onChipClick ? "button" : undefined,
                title,
                className: chipClass,
                // Suppress AG Grid's selection/edit handlers (mousedown/pointerdown)
                // so the chip click reaches our onClick instead of being eaten.
                onMouseDown: onChipClick ? (e: React.MouseEvent) => e.stopPropagation() : undefined,
                onPointerDown: onChipClick ? (e: React.PointerEvent) => e.stopPropagation() : undefined,
                onClick: onChipClick
                  ? (e: React.MouseEvent) => {
                      e.stopPropagation();
                      e.preventDefault();
                      if (resourceId) onChipClick(d.target_domain, resourceId, d.drift_status);
                    }
                  : undefined,
              },
              d.target_domain,
            );
          }),
      );
    },
    cellStyle: { display: "flex", alignItems: "center", paddingTop: 2, paddingBottom: 2, lineHeight: "1.2" },
    autoHeight: true,
    wrapText: true,
  };
}

/** Build AG Grid column definitions based on resource type */
export function buildReviewColumnDefs(
  resourceType: ReviewResourceType,
  opts: {
    wrapSummary?: boolean;
    reviewMode?: boolean;
    classificationValues?: ClassificationValues;
    crossDomain?: boolean;
    /** Append a "Deployed To" column reading from row.deployments. */
    showDeployments?: boolean;
    /** Click handler for Deployed To chips — opens a drift diff modal. */
    onDeploymentChipClick?: (targetDomain: string, resourceId: string, driftStatus: string) => void;
  } = {},
): ColDef<ReviewRow>[] {
  const {
    wrapSummary = false,
    reviewMode = true,
    classificationValues,
    crossDomain = false,
    showDeployments = false,
    onDeploymentChipClick,
  } = opts;

  const baseCols = resourceType !== "table"
    ? buildArtifactColumns(resourceType, classificationValues)
    : buildTableColumns({ wrapSummary, reviewMode, classificationValues });

  let cols = crossDomain ? [DOMAIN_COLUMN, ...baseCols] : baseCols;
  if (showDeployments) cols = [...cols, buildDeployedToColumn(onDeploymentChipClick)];
  // Standardise the position + order of canonical common columns across all
  // 4 artifact tabs so reviewers see the same layout everywhere. Type-specific
  // columns keep their original relative ordering.
  cols = hoistCommonColumns(cols);
  // Tag headers with common/specific scope class so the grid header strip
  // visually separates Layer 1 canonical fields from artifact-specific ones.
  return cols.map(tagScopeArtifactCol);
}

// Canonical left-to-right order for common metadata columns. Used to
// re-position them consistently across all 4 artifact tabs AND the Skills
// grid (via SKILL_CANONICAL_COMMON_ORDER which mirrors this list using
// Skills-native field names). Keep these two lists in lockstep — the user
// expects the layout to look identical wherever shared metadata appears.
export const CANONICAL_COMMON_ORDER: string[] = [
  "tags",
  "category", "subcategory",
  "dataCategory", "dataSubCategory",
  "dataType",
  "usageStatus",
  "solution", "action",
  "deployedTo",
  "owner", "verified",
  "updatedDate",
];

function hoistCommonColumns(cols: (ColDef<ReviewRow> | ColGroupDef<ReviewRow>)[]): (ColDef<ReviewRow> | ColGroupDef<ReviewRow>)[] {
  // Identity columns stay where they are (typically pinned-left or first).
  const identityFields = new Set(["displayName", "name", "isStale", "id", "domain", "deployedTo"]);
  const identityCols: typeof cols = [];
  const commonByField = new Map<string, typeof cols[number]>();
  const otherCols: typeof cols = [];

  for (const col of cols) {
    const field = ("field" in col ? (col.field as string | undefined) : undefined)
      ?? (col as ColDef).colId
      ?? "";
    if (identityFields.has(field)) {
      identityCols.push(col);
    } else if (CANONICAL_COMMON_ORDER.includes(field)) {
      commonByField.set(field, col);
    } else {
      otherCols.push(col);
    }
  }

  const orderedCommon: typeof cols = [];
  for (const f of CANONICAL_COMMON_ORDER) {
    const c = commonByField.get(f);
    if (c) orderedCommon.push(c);
  }
  return [...identityCols, ...orderedCommon, ...otherCols];
}

// ─── Table columns ───────────────────────────────────────────────────────────

function buildTableColumns(opts: {
  wrapSummary: boolean;
  reviewMode: boolean;
  classificationValues?: ClassificationValues;
}): ColDef<ReviewRow>[] {
  const { wrapSummary, reviewMode, classificationValues } = opts;
  const cv = classificationValues;

  return [
    {
      field: "displayName",
      headerName: "Name",
      cellRenderer: NameCellRenderer,
      minWidth: 220,
      flex: 2,
      filter: "agTextColumnFilter",
      enableRowGroup: false,
    },
    {
      field: "isStale",
      headerName: "Stale",
      width: 80,
      filter: "agSetColumnFilter",
      hide: true,
    },
    {
      field: "name",
      headerName: "Table ID",
      minWidth: 150,
      width: 150,
      cellClass: "text-xs font-mono text-zinc-500",
      filter: "agTextColumnFilter",
      hide: true,
      enableRowGroup: false,
    },
    {
      field: "suggestedName",
      headerName: "Suggested Name",
      minWidth: 180,
      flex: 1,
      filter: "agTextColumnFilter",
      enableRowGroup: false,
      hide: true,
    },
    {
      field: "dataSource",
      headerName: "Data Source",
      width: 120,
      filter: "agSetColumnFilter",
      editable: reviewMode,
      cellEditor: "agTextCellEditor",
      cellEditorParams: cv ? { values: ["", ...cv.dataSource] } : undefined,
    },
    {
      field: "summaryShort",
      headerName: "Short Summary",
      minWidth: 200,
      flex: 1,
      filter: "agTextColumnFilter",
      cellClass: "text-xs text-zinc-400",
      enableRowGroup: false,
      wrapText: wrapSummary,
      autoHeight: wrapSummary,
      editable: reviewMode,
      cellEditor: "agLargeTextCellEditor",
      cellEditorParams: { maxLength: 500, rows: 3, cols: 50 },
      cellEditorPopup: true,
    },
    {
      field: "summaryFull",
      headerName: "Full Summary",
      minWidth: 300,
      flex: 2,
      filter: "agTextColumnFilter",
      cellClass: "text-xs text-zinc-400",
      enableRowGroup: false,
      wrapText: wrapSummary,
      autoHeight: wrapSummary,
      editable: reviewMode,
      cellEditor: "agLargeTextCellEditor",
      cellEditorParams: { maxLength: 2000, rows: 6, cols: 60 },
      cellEditorPopup: true,
    },
    {
      // Real `tags` field column. The earlier "Tags" column here was a
      // read-only synthesized view (dataCategory + dataType + usageStatus
      // etc. squashed into one chip strip), which couldn't be edited even
      // though it looked like the obvious place. Replaced with a real
      // editable column that writes through to data.tags via valueParser.
      // Per-classification columns (Data Category, Data Representation, Status,
      // Action…) cover the synthesized fields individually for review mode.
      field: "tags",
      headerName: "Tags",
      width: 220,
      filter: "agTextColumnFilter",
      enableRowGroup: false,
      editable: reviewMode,
      // agTextCellEditor instead of a custom editor — the custom editor fired
      // onValueChange on every keystroke, which AG Grid surfaces as value
      // updates and (via modifiedRows) re-renders the grid mid-typing,
      // causing focus loss and premature commits. The built-in editor only
      // commits on stop (Enter/Tab/blur), and we still get array semantics
      // via valueFormatter (read/initial-edit-value) + valueParser (commit).
      cellEditor: "agTextCellEditor",
      cellRenderer: TagsChipsCell,
      valueFormatter: (p) => Array.isArray(p.value) ? p.value.join(", ") : (p.value ?? ""),
      valueParser: (p) => {
        const v = p.newValue;
        if (Array.isArray(v)) return v.map((s: unknown) => String(s).trim()).filter(Boolean);
        if (v == null || v === "") return [];
        return String(v).split(",").map((s) => s.trim()).filter(Boolean);
      },
    },
    {
      field: "rowCount",
      headerName: "Rows",
      width: 90,
      type: "numericColumn",
      valueFormatter: (params: ValueFormatterParams) =>
        params.value != null ? params.value.toLocaleString() : "-",
      filter: "agNumberColumnFilter",
      enableRowGroup: false,
    },
    {
      field: "daysSinceCreated",
      headerName: "Created",
      width: 80,
      cellRenderer: DaysCellRenderer,
      filter: "agNumberColumnFilter",
      headerTooltip: "Days since last record created",
      enableRowGroup: false,
    },
    {
      field: "daysSinceUpdate",
      headerName: "Updated",
      width: 80,
      cellRenderer: DaysCellRenderer,
      filter: "agNumberColumnFilter",
      headerTooltip: "Days since last business date update",
      enableRowGroup: false,
    },
    {
      field: "category",
      headerName: "Category",
      width: 140,
      filter: "agSetColumnFilter",
      editable: reviewMode,
      cellEditor: "agTextCellEditor",
    },
    {
      field: "subcategory",
      headerName: "Subcategory",
      width: 130,
      filter: "agSetColumnFilter",
      editable: reviewMode,
      cellEditor: "agTextCellEditor",
    },
    {
      field: "dataCategory",
      headerName: "Data Category",
      width: 140,
      rowGroup: !reviewMode,
      hide: false,
      filter: "agSetColumnFilter",
      editable: reviewMode,
      cellEditor: "agTextCellEditor",
      cellEditorParams: cv ? { values: ["", ...cv.dataCategory] } : undefined,
    },
    {
      field: "dataSubCategory",
      headerName: "Data Sub-Category",
      width: 140,
      filter: "agSetColumnFilter",
      editable: reviewMode,
      cellEditor: "agTextCellEditor",
      cellEditorParams: cv ? { values: ["", ...cv.dataSubCategory] } : undefined,
    },
    {
      field: "usageStatus",
      headerName: "Status",
      width: 100,
      cellRenderer: reviewMode ? undefined : StatusCellRenderer,
      filter: "agSetColumnFilter",
      editable: reviewMode,
      cellEditor: "agTextCellEditor",
      cellEditorParams: cv ? { values: ["", ...cv.usageStatus] } : undefined,
    },
    {
      field: "action",
      headerName: "Action",
      width: 100,
      cellRenderer: reviewMode ? undefined : ActionCellRenderer,
      filter: "agSetColumnFilter",
      editable: reviewMode,
      cellEditor: "agTextCellEditor",
      cellEditorParams: cv ? { values: ["", ...cv.action] } : undefined,
    },
    {
      field: "dataType",
      headerName: "Data Representation",
      width: 170,
      filter: "agSetColumnFilter",
      editable: reviewMode,
      // Datalist editor — picks from the existing vocabulary OR commits a
      // new typed value. agRichSelectCellEditor in v35 reverts free text;
      // the new value flows through onCellEdited → syncEditToStore which
      // adds it to lookup_values for next time.
      cellEditor: DatalistCellEditor,
      cellEditorPopup: false,
      cellEditorParams: cv
        ? { values: ["", ...cv.dataType], placeholder: "e.g. mapping, configuration-settings" }
        : undefined,
      cellRenderer: DataRepresentationCell,
      headerTooltip: "Nature of the data. Type to search or add a new value.",
    },
    {
      field: "sourceSystem",
      headerName: "Source System",
      width: 120,
      filter: "agSetColumnFilter",
      editable: reviewMode,
      cellEditor: "agTextCellEditor",
      cellEditorParams: cv ? { values: ["", ...cv.sourceSystem] } : undefined,
    },
    {
      field: "includeSitemap",
      headerName: "Sitemap",
      width: 85,
      filter: "agSetColumnFilter",
      editable: reviewMode,
      cellRenderer: (params: { value: boolean }) => params.value ? "Yes" : "",
      cellEditor: "agCheckboxCellEditor",
      headerTooltip: "Include this table on the client portal sitemap",
    },
    {
      field: "sitemapGroup1",
      headerName: "Sitemap Grp 1",
      width: 120,
      filter: "agSetColumnFilter",
      editable: reviewMode,
      cellEditor: "agTextCellEditor",
      headerTooltip: "Primary grouping on the portal sitemap",
    },
    {
      field: "sitemapGroup2",
      headerName: "Sitemap Grp 2",
      width: 120,
      filter: "agSetColumnFilter",
      editable: reviewMode,
      cellEditor: "agTextCellEditor",
      headerTooltip: "Secondary grouping on the portal sitemap",
    },
    {
      field: "solution",
      headerName: "Solution",
      width: 140,
      filter: "agSetColumnFilter",
      editable: reviewMode,
      cellEditor: "agTextCellEditor",
      headerTooltip: "Which VAL solution this resource belongs to",
    },
    {
      field: "owner",
      headerName: "Owner",
      width: 120,
      filter: "agSetColumnFilter",
      editable: reviewMode,
      cellEditor: "agTextCellEditor",
      headerTooltip: "Person/team responsible for this resource",
    },
    {
      field: "verified",
      headerName: "Verified",
      width: 90,
      filter: "agSetColumnFilter",
      editable: reviewMode,
      cellEditor: "agCheckboxCellEditor",
      cellRenderer: "agCheckboxCellRenderer",
    },
    {
      field: "resourceUrl",
      headerName: "URL",
      width: 250,
      filter: "agTextColumnFilter",
      editable: reviewMode,
      headerTooltip: "URL to access this resource in VAL",
    },
    {
      field: "workflowCount",
      headerName: "Workflows",
      width: 90,
      type: "numericColumn",
      filter: "agNumberColumnFilter",
      headerTooltip: "Total number of workflows using this table",
      valueFormatter: (params: ValueFormatterParams) => params.value != null ? String(params.value) : "-",
    },
    {
      field: "scheduledWorkflowCount",
      headerName: "Sched WFs",
      width: 90,
      type: "numericColumn",
      filter: "agNumberColumnFilter",
      headerTooltip: "Number of scheduled workflows using this table",
      valueFormatter: (params: ValueFormatterParams) => params.value != null ? String(params.value) : "-",
    },
    {
      field: "queryCount",
      headerName: "Queries",
      width: 80,
      type: "numericColumn",
      filter: "agNumberColumnFilter",
      headerTooltip: "Number of queries using this table",
      valueFormatter: (params: ValueFormatterParams) => params.value != null ? String(params.value) : "-",
    },
    {
      field: "dashboardCount",
      headerName: "Dashboards",
      width: 95,
      type: "numericColumn",
      filter: "agNumberColumnFilter",
      headerTooltip: "Number of dashboards using this table",
      valueFormatter: (params: ValueFormatterParams) => params.value != null ? String(params.value) : "-",
    },
    {
      field: "columnCount",
      headerName: "Columns",
      width: 85,
      type: "numericColumn",
      filter: "agNumberColumnFilter",
      headerTooltip: "Total number of columns",
      valueFormatter: (params: ValueFormatterParams) => params.value != null ? String(params.value) : "-",
    },
    {
      field: "calculatedColumnCount",
      headerName: "Calc Cols",
      width: 85,
      type: "numericColumn",
      filter: "agNumberColumnFilter",
      headerTooltip: "Number of calculated columns",
      valueFormatter: (params: ValueFormatterParams) => params.value != null ? String(params.value) : "-",
    },
    {
      field: "lastSampleAt",
      headerName: "Last Sample",
      width: 140,
      filter: "agDateColumnFilter",
      headerTooltip: "Last time sample data was fetched",
      valueFormatter: dateTimeFormatter,
    },
    {
      field: "lastDetailsAt",
      headerName: "Last Details",
      width: 140,
      filter: "agDateColumnFilter",
      headerTooltip: "Last time details were fetched",
      valueFormatter: dateTimeFormatter,
    },
    {
      field: "lastAnalyzeAt",
      headerName: "Last Analyze",
      width: 140,
      filter: "agDateColumnFilter",
      headerTooltip: "Last time AI analysis was run",
      valueFormatter: dateTimeFormatter,
    },
    {
      field: "lastOverviewAt",
      headerName: "Last Overview",
      width: 140,
      filter: "agDateColumnFilter",
      headerTooltip: "Last time overview.md was generated",
      valueFormatter: dateTimeFormatter,
    },
    {
      field: "space",
      headerName: "Space",
      width: 100,
      filter: "agSetColumnFilter",
      hide: true,
    },
  ];
}

// ─── Artifact columns (queries, dashboards, workflows) ──────────────────────

function buildArtifactColumns(
  resourceType: ReviewResourceType,
  classificationValues?: ClassificationValues,
): ColDef<ReviewRow>[] {
  const cv = classificationValues;

  const baseCols: ColDef<ReviewRow>[] = [
    {
      field: "name",
      headerName: "Name",
      pinned: "left",
      width: 250,
      filter: "agTextColumnFilter",
      cellRenderer: (params: { value: string; data?: { isStale?: boolean } }) => {
        if (!params.data?.isStale) return params.value;
        return React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: "6px" } },
          React.createElement("span", { style: { background: "#ef4444", color: "white", fontSize: "10px", padding: "1px 5px", borderRadius: "3px", fontWeight: 600, flexShrink: 0 } }, "Deleted"),
          params.value || "",
        );
      },
    },
    { field: "isStale", headerName: "Stale", width: 80, filter: "agSetColumnFilter", hide: true },
    { field: "id", headerName: "ID", width: 100, filter: "agTextColumnFilter" },
  ];

  // Type-specific columns
  const typeCols: ColDef<ReviewRow>[] = [];
  if (resourceType === "query") {
    typeCols.push(
      { field: "category", headerName: "Category", width: 110, filter: "agSetColumnFilter" },
      { field: "tableName", headerName: "Table", width: 180, filter: "agTextColumnFilter" },
      { field: "fieldCount", headerName: "Fields", width: 80, filter: "agNumberColumnFilter" },
    );
  } else if (resourceType === "dashboard") {
    typeCols.push(
      { field: "category", headerName: "Category", width: 110, filter: "agSetColumnFilter" },
      { field: "widgetCount", headerName: "Widgets", width: 90, filter: "agNumberColumnFilter" },
      { field: "creatorName", headerName: "Creator", width: 140, filter: "agTextColumnFilter" },
      { field: "gaViews7d", headerName: "Views 7d", width: 80, type: "numericColumn", filter: "agNumberColumnFilter", valueFormatter: (p: ValueFormatterParams) => p.value != null ? String(p.value) : "-" },
      { field: "gaViews30d", headerName: "Views 30d", width: 85, type: "numericColumn", filter: "agNumberColumnFilter", valueFormatter: (p: ValueFormatterParams) => p.value != null ? String(p.value) : "-" },
      { field: "gaViews90d", headerName: "Views 90d", width: 85, type: "numericColumn", filter: "agNumberColumnFilter", valueFormatter: (p: ValueFormatterParams) => p.value != null ? String(p.value) : "-" },
      { field: "gaUsers30d", headerName: "Users 30d", width: 85, type: "numericColumn", filter: "agNumberColumnFilter", valueFormatter: (p: ValueFormatterParams) => p.value != null ? String(p.value) : "-" },
      { field: "gaLastViewed", headerName: "Last Viewed", width: 105, filter: "agDateColumnFilter" },
      {
        field: "gaHealthScore",
        headerName: "Health",
        width: 75,
        type: "numericColumn",
        filter: "agNumberColumnFilter",
        cellRenderer: (params: { value: number | null }) => {
          if (params.value == null) return "-";
          const v = params.value;
          const color = v >= 80 ? "#22c55e" : v >= 50 ? "#eab308" : v >= 20 ? "#f97316" : "#ef4444";
          return React.createElement("span", { style: { color, fontWeight: 600, fontSize: "12px" } }, String(v));
        },
      },
      {
        field: "gaHealthStatus",
        headerName: "Status",
        width: 90,
        filter: "agSetColumnFilter",
        cellRenderer: (params: { value: string | null }) => {
          if (!params.value) return "-";
          const colors: Record<string, string> = {
            active: "#22c55e",
            declining: "#eab308",
            stale: "#f97316",
            dead: "#ef4444",
            unused: "#a1a1aa",
          };
          const color = colors[params.value] || "#a1a1aa";
          return React.createElement("span", { style: { color, fontWeight: 500, fontSize: "12px", textTransform: "capitalize" } }, params.value);
        },
      },
    );
  } else if (resourceType === "workflow") {
    typeCols.push(
      {
        field: "isScheduled",
        headerName: "Scheduled",
        width: 100,
        filter: "agSetColumnFilter",
        valueFormatter: (p) => p.value === true ? "Yes" : p.value === false ? "No" : "",
      },
      { field: "cronExpression", headerName: "Cron", width: 130, filter: "agTextColumnFilter" },
      { field: "pluginCount", headerName: "Plugins", width: 90, filter: "agNumberColumnFilter" },
      { field: "description", headerName: "Description", width: 200, filter: "agTextColumnFilter" },
    );
  } else if (resourceType === "drive_file") {
    typeCols.push({
      colId: "folder",
      headerName: "Folder",
      width: 260,
      filter: "agTextColumnFilter",
      // Containing folder = full file path minus the leaf. Derived so no
      // ReviewRow schema change is needed.
      valueGetter: (p: ValueGetterParams<ReviewRow>) => {
        const fp = p.data?.folderName ?? "";
        const i = fp.lastIndexOf("/");
        return i > 0 ? fp.slice(0, i) : "";
      },
    });
  }

  // Classification columns (editable)
  const classifCols: ColDef<ReviewRow>[] = [
    {
      field: "dataType",
      headerName: "Data Representation",
      width: 170,
      editable: true,
      // Same datalist editor as the table-specific block above so picking
      // OR typing a new value behaves identically across all artifact types.
      cellEditor: DatalistCellEditor,
      cellEditorPopup: false,
      cellEditorParams: cv
        ? { values: cv.dataType ? ["", ...cv.dataType] : [], placeholder: "e.g. mapping, configuration-settings" }
        : undefined,
      cellRenderer: DataRepresentationCell,
      filter: "agSetColumnFilter",
      headerTooltip: "Nature of the data. Type to search or add a new value.",
    },
    {
      field: "category",
      headerName: "Category",
      width: 140,
      editable: true,
      cellEditor: "agTextCellEditor",
      filter: "agSetColumnFilter",
    },
    {
      field: "subcategory",
      headerName: "Subcategory",
      width: 130,
      editable: true,
      cellEditor: "agTextCellEditor",
      filter: "agSetColumnFilter",
    },
    {
      field: "dataCategory",
      headerName: "Data Category",
      width: 140,
      editable: true,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: cv ? { values: cv.dataCategory ? ["", ...cv.dataCategory] : [] } : undefined,
      filter: "agSetColumnFilter",
    },
    {
      field: "dataSubCategory",
      headerName: "Data Sub-Category",
      width: 150,
      editable: true,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: cv ? { values: cv.dataSubCategory ? ["", ...cv.dataSubCategory] : [] } : undefined,
      filter: "agSetColumnFilter",
    },
    {
      // Same field as the table-specific block above — keeping the header as
      // "Status" matches Skills and Tables so the shared classification
      // column reads consistently across all five resource types.
      field: "usageStatus",
      headerName: "Status",
      width: 120,
      editable: true,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: cv ? { values: cv.usageStatus ? ["", ...cv.usageStatus] : [] } : undefined,
      filter: "agSetColumnFilter",
    },
    {
      field: "action",
      headerName: "Action",
      width: 120,
      editable: true,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: cv ? { values: cv.action ? ["", ...cv.action] : [] } : undefined,
      filter: "agSetColumnFilter",
    },
    {
      field: "dataSource",
      headerName: "Data Source",
      width: 140,
      editable: true,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: cv ? { values: cv.dataSource ? ["", ...cv.dataSource] : [] } : undefined,
      filter: "agSetColumnFilter",
    },
    {
      field: "sourceSystem",
      headerName: "Source System",
      width: 140,
      editable: true,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: cv ? { values: cv.sourceSystem ? ["", ...cv.sourceSystem] : [] } : undefined,
      filter: "agSetColumnFilter",
    },
    {
      field: "includeSitemap",
      headerName: "Sitemap",
      width: 85,
      filter: "agSetColumnFilter",
      editable: true,
      cellRenderer: (params: { value: boolean }) => params.value ? "Yes" : "",
      cellEditor: "agCheckboxCellEditor",
      headerTooltip: "Include on the client portal sitemap",
    },
    {
      field: "sitemapGroup1",
      headerName: "Sitemap Grp 1",
      width: 120,
      filter: "agSetColumnFilter",
      editable: true,
      cellEditor: "agTextCellEditor",
      headerTooltip: "Primary grouping on the portal sitemap",
    },
    {
      field: "sitemapGroup2",
      headerName: "Sitemap Grp 2",
      width: 120,
      filter: "agSetColumnFilter",
      editable: true,
      cellEditor: "agTextCellEditor",
      headerTooltip: "Secondary grouping on the portal sitemap",
    },
    {
      field: "solution",
      headerName: "Solution",
      width: 140,
      filter: "agSetColumnFilter",
      editable: true,
      cellEditor: "agTextCellEditor",
      headerTooltip: "Which VAL solution this resource belongs to",
    },
    {
      field: "owner",
      headerName: "Owner",
      width: 120,
      filter: "agSetColumnFilter",
      editable: true,
      cellEditor: "agTextCellEditor",
      headerTooltip: "Person/team responsible for this resource",
    },
    {
      field: "verified",
      headerName: "Verified",
      width: 90,
      filter: "agSetColumnFilter",
      editable: true,
      cellEditor: "agCheckboxCellEditor",
      cellRenderer: "agCheckboxCellRenderer",
    },
    {
      field: "resourceUrl",
      headerName: "URL",
      width: 250,
      editable: true,
      filter: "agTextColumnFilter",
      headerTooltip: "URL to access this resource in VAL",
    },
    {
      field: "tags",
      headerName: "Tags",
      width: 200,
      editable: true,
      filter: "agTextColumnFilter",
      // Custom editor that keeps tags as `string[]` on commit while showing
      // a comma-separated string in the input. agTextCellEditor renders the
      // array as "[object Object]" or blank, hence the dedicated editor.
      // agTextCellEditor instead of a custom editor — the custom editor fired
      // onValueChange on every keystroke, which AG Grid surfaces as value
      // updates and (via modifiedRows) re-renders the grid mid-typing,
      // causing focus loss and premature commits. The built-in editor only
      // commits on stop (Enter/Tab/blur), and we still get array semantics
      // via valueFormatter (read/initial-edit-value) + valueParser (commit).
      cellEditor: "agTextCellEditor",
      cellRenderer: TagsChipsCell,
      valueFormatter: (p) => Array.isArray(p.value) ? p.value.join(", ") : (p.value ?? ""),
      valueParser: (p) => {
        const v = p.newValue;
        if (Array.isArray(v)) return v.map((s: unknown) => String(s).trim()).filter(Boolean);
        if (v == null || v === "") return [];
        return String(v).split(",").map((s) => s.trim()).filter(Boolean);
      },
    },
    {
      field: "suggestedName",
      headerName: "Suggested Name",
      width: 180,
      editable: true,
      filter: "agTextColumnFilter",
    },
    {
      field: "summaryShort",
      headerName: "Summary",
      width: 250,
      editable: true,
      filter: "agTextColumnFilter",
    },
  ];

  // Date columns
  const dateCols: ColDef<ReviewRow>[] = [
    { field: "createdDate", headerName: "Created", width: 120, filter: "agDateColumnFilter" },
    { field: "updatedDate", headerName: "Updated", width: 120, filter: "agDateColumnFilter" },
  ];

  return [...baseCols, ...typeCols, ...classifCols, ...dateCols];
}
