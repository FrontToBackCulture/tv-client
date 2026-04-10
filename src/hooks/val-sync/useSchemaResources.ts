import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

// ─── Types ───

export interface WorkflowResource {
  id: number;
  name: string;
}

export interface TableResource {
  name: string; // display name
  value: string; // custom_tbl_* identifier
}

export interface DashboardResource {
  id: number;
  name: string;
}

export interface SchemaResources {
  workflows: WorkflowResource[];
  tables: TableResource[];
  dashboards: DashboardResource[];
}

// ─── Helpers ───

/** Flatten tree-structured tables to leaf nodes with custom_tbl_* values */
function flattenTables(nodes: any[]): TableResource[] {
  const results: TableResource[] = [];
  for (const node of nodes) {
    if (typeof node !== "object" || !node) continue;
    const val = node.value ?? "";
    if (typeof val === "string" && val.includes("custom_tbl_")) {
      results.push({ name: node.name ?? val, value: val });
    }
    if (Array.isArray(node.children)) {
      results.push(...flattenTables(node.children));
    }
  }
  return results;
}

async function readJsonFile(path: string): Promise<any> {
  const raw = await invoke<string>("read_file", { path });
  return JSON.parse(raw);
}

// ─── Hook ───

export function useSchemaResources(globalPath: string | null) {
  return useQuery({
    queryKey: ["val-schema-resources", globalPath],
    queryFn: async (): Promise<SchemaResources> => {
      const schemaDir = `${globalPath}/schema`;

      const [wfRaw, tblRaw, dashRaw] = await Promise.all([
        readJsonFile(`${schemaDir}/all_workflows.json`).catch(() => null),
        readJsonFile(`${schemaDir}/all_tables.json`).catch(() => null),
        readJsonFile(`${schemaDir}/all_dashboards.json`).catch(() => null),
      ]);

      // Workflows: {data: [{id, name, ...}]} or [{id, name, ...}]
      const wfData = wfRaw?.data ?? wfRaw ?? [];
      const workflows: WorkflowResource[] = (Array.isArray(wfData) ? wfData : [])
        .filter((w: any) => w?.id != null && w?.name)
        .map((w: any) => ({ id: w.id, name: w.name }));

      // Tables: tree structure, flatten to leaves
      const tblData = Array.isArray(tblRaw) ? tblRaw : tblRaw?.data ?? [];
      const tables = flattenTables(tblData);

      // Dashboards: [{id, name, ...}] or {data: [...]}
      const dashData = Array.isArray(dashRaw) ? dashRaw : dashRaw?.data ?? [];
      const dashboards: DashboardResource[] = (Array.isArray(dashData) ? dashData : [])
        .filter((d: any) => d?.id != null && d?.name)
        .map((d: any) => ({ id: d.id, name: d.name }));

      return { workflows, tables, dashboards };
    },
    enabled: !!globalPath,
    staleTime: 5 * 60_000,
  });
}
