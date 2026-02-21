// DataModelsAgGrid: Data loading logic

import { invoke } from "@tauri-apps/api/core";
import type { TableInfo } from "./dataModelsGridTypes";
import { buildDomainUrl } from "../../lib/domainUrl";

/** Load tables from data-models-index.json, falling back to directory scan */
export async function loadTablesData(dataModelsPath: string): Promise<TableInfo[]> {
  // Try to load from data-models-index.json first
  const indexPath = `${dataModelsPath}/data-models-index.json`;

  try {
    const content = await invoke<string>("read_file", { path: indexPath });
    const indexData = JSON.parse(content);

    if (indexData.tables && Array.isArray(indexData.tables) && indexData.tables.length > 0) {
      const tableList: TableInfo[] = indexData.tables.map((t: Record<string, unknown>) => ({
        name: t.name as string,
        path: `${dataModelsPath}/table_${t.name}`,
        hasOverview: t.hasOverview as boolean || false,
        displayName: t.displayName as string | null,
        columnCount: t.columnCount as number | null,
        calculatedColumnCount: t.calculatedColumnCount as number | null,
        dataType: t.dataType as string | null,
        dataCategory: t.dataCategory as string | null,
        dataSubCategory: t.dataSubCategory as string | null,
        rowCount: t.rowCount as number | null,
        daysSinceCreated: t.daysSinceCreated as number | null,
        daysSinceUpdate: t.daysSinceUpdate as number | null,
        usageStatus: t.usageStatus as string | null,
        suggestedName: t.suggestedName as string | null,
        dataSource: t.dataSource as string | null,
        sourceSystem: t.sourceSystem as string | null,
        summaryShort: t.summaryShort as string | null,
        summaryFull: t.summaryFull as string | null,
        space: t.space as string | null,
        action: t.action as string | null,
        tags: t.tags as string | null,
        tableType: t.tableType as string | null,
        includeSitemap: t.includeSitemap === true,
        sitemapGroup1: t.sitemapGroup1 as string | null,
        sitemapGroup2: t.sitemapGroup2 as string | null,
        solution: t.solution as string | null,
        resourceUrl: (t as Record<string, unknown>).resourceUrl as string | null,
        workflowCount: t.workflowCount as number | null,
        scheduledWorkflowCount: t.scheduledWorkflowCount as number | null,
        queryCount: t.queryCount as number | null,
        dashboardCount: t.dashboardCount as number | null,
        lastSampleAt: t.lastSampleAt as string | null,
        lastDetailsAt: t.lastDetailsAt as string | null,
        lastAnalyzeAt: t.lastAnalyzeAt as string | null,
        lastOverviewAt: t.lastOverviewAt as string | null,
      }));

      // Supplement with timestamps from actual files (index may not have them)
      return await supplementTimestamps(tableList);
    }
  } catch {
    // Index file not found or invalid, will fall back to scanning
  }

  // Fall back to scanning directories
  return await scanDirectories(dataModelsPath);
}

/** Supplement table data with timestamps from actual files */
async function supplementTimestamps(tableList: TableInfo[]): Promise<TableInfo[]> {
  return Promise.all(
    tableList.map(async (table) => {
      let lastSampleAt = table.lastSampleAt;
      let lastDetailsAt = table.lastDetailsAt;
      let lastAnalyzeAt = table.lastAnalyzeAt;
      let lastOverviewAt = table.lastOverviewAt;

      if (!lastSampleAt) {
        try {
          const sampleContent = await invoke<string>("read_file", {
            path: `${table.path}/definition_sample.json`,
          });
          const sample = JSON.parse(sampleContent);
          lastSampleAt = sample.meta?.sampledAt || null;
        } catch {
          // No sample file
        }
      }

      if (!lastDetailsAt) {
        try {
          const detailsContent = await invoke<string>("read_file", {
            path: `${table.path}/definition_details.json`,
          });
          const details = JSON.parse(detailsContent);
          lastDetailsAt = details.meta?.generatedAt || null;
        } catch {
          // No details file
        }
      }

      if (!lastAnalyzeAt) {
        try {
          const analysisContent = await invoke<string>("read_file", {
            path: `${table.path}/definition_analysis.json`,
          });
          const analysis = JSON.parse(analysisContent);
          lastAnalyzeAt = analysis.meta?.analyzedAt || null;
        } catch {
          // No analysis file
        }
      }

      if (!lastOverviewAt && table.hasOverview) {
        try {
          const fileInfo = await invoke<{ modified?: string }>("get_file_info", {
            path: `${table.path}/overview.md`,
          });
          lastOverviewAt = fileInfo.modified || null;
        } catch {
          // Ignore
        }
      }

      return { ...table, lastSampleAt, lastDetailsAt, lastAnalyzeAt, lastOverviewAt };
    })
  );
}

/** Fall back to scanning table_ directories */
async function scanDirectories(dataModelsPath: string): Promise<TableInfo[]> {
  const entries = await invoke<Array<{ name: string; path: string; is_directory: boolean }>>(
    "list_directory",
    { path: dataModelsPath }
  );

  const tableDirs = entries.filter(
    (e) => e.is_directory && e.name.startsWith("table_")
  );

  return Promise.all(
    tableDirs.map(async (dir) => {
      const tableName = dir.name.replace(/^table_/, "");
      let displayName: string | null = null;
      let hasOverview = false;
      let columnCount: number | null = null;
      let calculatedColumnCount: number | null = null;
      let dataType: string | null = null;
      let dataCategory: string | null = null;
      let dataSubCategory: string | null = null;
      let rowCount: number | null = null;
      let daysSinceCreated: number | null = null;
      let daysSinceUpdate: number | null = null;
      let usageStatus: string | null = null;
      let action: string | null = null;
      let suggestedName: string | null = null;
      let dataSource: string | null = null;
      let sourceSystem: string | null = null;
      let summaryShort: string | null = null;
      let summaryFull: string | null = null;
      let tags: string | null = null;
      let tableType: string | null = null;
      let includeSitemap = false;
      let sitemapGroup1: string | null = null;
      let sitemapGroup2: string | null = null;
      let solution: string | null = null;
      let resourceUrl: string | null = null;
      let workflowCount: number | null = null;
      let scheduledWorkflowCount: number | null = null;
      let queryCount: number | null = null;
      let dashboardCount: number | null = null;
      let lastDetailsAt: string | null = null;
      let lastSampleAt: string | null = null;
      let lastAnalyzeAt: string | null = null;
      let lastOverviewAt: string | null = null;

      // Read definition_details.json
      try {
        const detailsContent = await invoke<string>("read_file", {
          path: `${dir.path}/definition_details.json`,
        });
        const details = JSON.parse(detailsContent);
        displayName = details.meta?.displayName || null;
        tableType = details.meta?.tableType || null;
        lastDetailsAt = details.meta?.generatedAt || null;
        if (details.health) {
          if (details.health.daysSinceCreated !== undefined) {
            daysSinceCreated = details.health.daysSinceCreated;
          }
          if (details.health.daysSinceUpdate !== undefined) {
            daysSinceUpdate = details.health.daysSinceUpdate;
          }
        }
        if (details.columns) {
          if (Array.isArray(details.columns)) {
            columnCount = details.columns.length;
            calculatedColumnCount = details.columns.filter(
              (col: { formula?: string; isCalculated?: boolean }) =>
                col.formula || col.isCalculated
            ).length;
          } else {
            const systemCols = details.columns.system?.length || 0;
            const dataCols = details.columns.data?.length || details.columns.custom?.length || 0;
            const calcCols = details.columns.calculated?.length || 0;
            columnCount = systemCols + dataCols + calcCols;
            calculatedColumnCount = calcCols;
          }
        }
        if (details.relationships) {
          if (details.relationships.workflows && Array.isArray(details.relationships.workflows)) {
            workflowCount = details.relationships.workflows.length;
            scheduledWorkflowCount = details.relationships.workflows.filter(
              (wf: { scheduled?: boolean }) => wf.scheduled === true
            ).length;
          }
          if (details.relationships.queries && Array.isArray(details.relationships.queries)) {
            queryCount = details.relationships.queries.length;
          }
          if (details.relationships.dashboards && Array.isArray(details.relationships.dashboards)) {
            dashboardCount = details.relationships.dashboards.length;
          }
        }
      } catch {
        // No details file
      }

      // Read definition_sample.json for timestamp + rowCount
      try {
        const sampleContent = await invoke<string>("read_file", {
          path: `${dir.path}/definition_sample.json`,
        });
        const sample = JSON.parse(sampleContent);
        lastSampleAt = sample.meta?.sampledAt || null;
        if (sample.meta?.totalRowCount != null) {
          rowCount = sample.meta.totalRowCount;
        }
      } catch {
        // No sample file
      }

      // Check if overview.md exists
      try {
        await invoke<string>("read_file", { path: `${dir.path}/overview.md` });
        hasOverview = true;
      } catch {
        // No overview file
      }

      // Read definition_analysis.json — single source of truth for classification
      try {
        const analysisContent = await invoke<string>("read_file", {
          path: `${dir.path}/definition_analysis.json`,
        });
        const analysis = JSON.parse(analysisContent);
        suggestedName = analysis.suggestedName || null;
        dataType = analysis.dataType || analysis.classification?.dataType || null;
        summaryShort = analysis.summary?.short || null;
        summaryFull = analysis.summary?.full || null;
        lastAnalyzeAt = analysis.meta?.analyzedAt || null;
        dataCategory = analysis.dataCategory || null;
        dataSubCategory = analysis.dataSubCategory || null;
        dataSource = analysis.dataSource || null;
        usageStatus = analysis.usageStatus || null;
        action = analysis.action || null;
        tags = analysis.tags || null;
        sourceSystem = analysis.sourceSystem || null;
        includeSitemap = analysis.includeSitemap === true;
        sitemapGroup1 = analysis.sitemapGroup1 || null;
        sitemapGroup2 = analysis.sitemapGroup2 || null;
        solution = analysis.solution || null;
        resourceUrl = analysis.resourceUrl || null;
      } catch {
        // No analysis file
      }

      // Auto-populate resourceUrl from folder path if not set
      if (!resourceUrl) {
        resourceUrl = buildDomainUrl(dir.path) || null;
      }

      // Get overview.md file modified time
      if (hasOverview) {
        try {
          const fileInfo = await invoke<{ modified?: string }>("get_file_info", {
            path: `${dir.path}/overview.md`,
          });
          lastOverviewAt = fileInfo.modified || null;
        } catch {
          // Ignore
        }
      }

      return {
        name: tableName,
        path: dir.path,
        hasOverview,
        displayName: displayName || suggestedName || tableName,
        columnCount,
        calculatedColumnCount,
        dataType,
        dataCategory,
        dataSubCategory,
        rowCount,
        daysSinceCreated,
        daysSinceUpdate,
        usageStatus,
        suggestedName,
        dataSource,
        sourceSystem,
        summaryShort,
        summaryFull,
        space: null,
        action,
        tags,
        tableType,
        includeSitemap,
        sitemapGroup1,
        sitemapGroup2,
        solution,
        resourceUrl,
        workflowCount,
        scheduledWorkflowCount,
        queryCount,
        dashboardCount,
        lastSampleAt,
        lastDetailsAt,
        lastAnalyzeAt,
        lastOverviewAt,
      };
    })
  );
}
