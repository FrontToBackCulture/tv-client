// ArtifactReviewView: Data loading from filesystem

import { invoke } from "@tauri-apps/api/core";
import { buildDomainUrl } from "../../lib/domainUrl";
import type { ArtifactType, ArtifactRow } from "./artifactReviewTypes";
import { FOLDER_PREFIX } from "./artifactReviewTypes";

/** Load artifact rows from filesystem folders */
export async function loadArtifactData(
  folderPath: string,
  artifactType: ArtifactType,
): Promise<ArtifactRow[]> {
  const entries = await invoke<Array<{ name: string; path: string; is_directory: boolean }>>(
    "list_directory",
    { path: folderPath }
  );

  const prefix = FOLDER_PREFIX[artifactType];
  const dirs = entries.filter((e) => e.is_directory && (prefix ? e.name.startsWith(prefix) : !e.name.startsWith(".")));

  const rows: ArtifactRow[] = await Promise.all(
    dirs.map(async (dir) => {
      const row: ArtifactRow = {
        id: dir.name,
        name: dir.name,
        folderName: dir.name,
        folderPath: dir.path,
        createdDate: null,
        updatedDate: null,
        dataType: null,
        dataCategory: null,
        dataSubCategory: null,
        usageStatus: null,
        action: null,
        dataSource: null,
        sourceSystem: null,
        tags: null,
        suggestedName: null,
        summaryShort: null,
        summaryFull: null,
        includeSitemap: false,
        sitemapGroup1: null,
        sitemapGroup2: null,
        solution: null,
        resourceUrl: null,
        category: null,
        tableName: null,
        fieldCount: null,
        widgetCount: null,
        creatorName: null,
        isScheduled: null,
        cronExpression: null,
        pluginCount: null,
        description: null,
      };

      // Read definition.json
      try {
        const defContent = await invoke<string>("read_file", {
          path: `${dir.path}/definition.json`,
        });
        const def = JSON.parse(defContent);

        row.name = def.name || def.displayName || dir.name;
        row.id = String(def.id ?? dir.name);
        row.createdDate = def.created_date || null;
        row.updatedDate = def.updated_date || null;

        // Type-specific fields
        if (artifactType === "query") {
          row.category = def.category || null;
          row.tableName = def.datasource?.queryInfo?.tableInfo?.name || null;
          row.fieldCount = def.datasource?.queryInfo?.tableInfo?.fields?.length ?? null;
        } else if (artifactType === "dashboard") {
          row.category = def.category || null;
          row.widgetCount = Array.isArray(def.widgets) ? def.widgets.length : null;
          row.creatorName = def.created_by || null;
        } else if (artifactType === "workflow") {
          row.isScheduled = !!def.cron_expression;
          row.cronExpression = def.cron_expression || null;
          row.pluginCount = def.data?.workflow?.plugins?.length ?? null;
          row.description = def.description || null;
        }
      } catch {
        // No definition.json
      }

      // Read definition_analysis.json for classification
      try {
        const analysisContent = await invoke<string>("read_file", {
          path: `${dir.path}/definition_analysis.json`,
        });
        const analysis = JSON.parse(analysisContent);

        row.dataType = analysis.classification?.dataType || analysis.dataType || null;
        row.dataCategory = analysis.dataCategory || null;
        row.dataSubCategory = analysis.dataSubCategory || null;
        row.usageStatus = analysis.usageStatus || null;
        row.action = analysis.action || null;
        row.dataSource = analysis.dataSource || null;
        row.sourceSystem = analysis.sourceSystem || null;
        row.tags = analysis.tags || null;
        row.suggestedName = analysis.suggestedName || null;
        row.summaryShort = analysis.summary?.short || null;
        row.summaryFull = analysis.summary?.full || null;
        row.includeSitemap = analysis.includeSitemap === true;
        row.sitemapGroup1 = analysis.sitemapGroup1 || null;
        row.sitemapGroup2 = analysis.sitemapGroup2 || null;
        row.solution = analysis.solution || null;
        row.resourceUrl = analysis.resourceUrl || null;
      } catch {
        // No analysis file
      }

      // Auto-populate resourceUrl from folder path if not set
      if (!row.resourceUrl) {
        row.resourceUrl = buildDomainUrl(dir.path) || null;
      }

      return row;
    })
  );

  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}
