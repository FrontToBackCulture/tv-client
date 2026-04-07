// Supabase Edge Function: Sync Notion databases → Work Module tasks
// Designed to run on a schedule (every 4 hours via pg_cron).
//
// POST /notion-sync
// Body: { config_id?: string }
//   - config_id: sync one config, or all enabled if omitted
//
// For each enabled notion_sync_config:
//   1. Read Notion API key from config
//   2. Query Notion database with last_synced_at filter (incremental)
//   3. Map properties → task fields using field_mapping
//   4. Call sync_notion_task RPC for each page
//   5. Update last_synced_at on the config row

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseKey);

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_API_VERSION = "2022-06-28";

// ─── Types ───────────────────────────────────────

interface SyncConfig {
  id: string;
  name: string;
  notion_database_id: string;
  target_project_id: string | null;
  field_mapping: Record<string, unknown>;
  filter: Record<string, unknown> | null;
  last_synced_at: string | null;
  enabled: boolean | null;
  notion_api_key: string | null;
}

interface NotionPage {
  id: string;
  properties: Record<string, unknown>;
  last_edited_time?: string;
  created_time?: string;
  url?: string;
}

interface ConfigResult {
  config_name: string;
  tasks_created: number;
  tasks_updated: number;
  error?: string;
}

// ─── Notion API helpers ──────────────────────────

function notionHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Notion-Version": NOTION_API_VERSION,
    "Content-Type": "application/json",
  };
}

/** Query a Notion database with pagination, optional filter + since timestamp */
async function queryDatabase(
  databaseId: string,
  apiKey: string,
  userFilter: Record<string, unknown> | null,
  since: string | null,
): Promise<{ pages: NotionPage[]; filterWarning?: string }> {
  // Try with user filter first; on 400, retry without
  try {
    const pages = await queryDatabaseInner(databaseId, apiKey, userFilter, since);
    return { pages };
  } catch (err: unknown) {
    if (userFilter && err instanceof NotionApiError && err.status === 400) {
      console.warn(
        `[notion-sync] Filter rejected (400), retrying without filter: ${err.message}`,
      );
      const pages = await queryDatabaseInner(databaseId, apiKey, null, since);
      return { pages, filterWarning: err.message };
    }
    throw err;
  }
}

class NotionApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function queryDatabaseInner(
  databaseId: string,
  apiKey: string,
  userFilter: Record<string, unknown> | null,
  since: string | null,
): Promise<NotionPage[]> {
  const url = `${NOTION_API_BASE}/databases/${databaseId}/query`;
  const allPages: NotionPage[] = [];
  let cursor: string | null = null;

  // deno-lint-ignore no-constant-condition
  while (true) {
    const body: Record<string, unknown> = {
      page_size: 100,
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
    };

    // Build combined filter
    const combinedFilter = buildQueryFilter(userFilter, since);
    if (combinedFilter) body.filter = combinedFilter;
    if (cursor) body.start_cursor = cursor;

    const res = await fetch(url, {
      method: "POST",
      headers: notionHeaders(apiKey),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new NotionApiError(res.status, parseNotionError(text));
    }

    const data = await res.json();
    allPages.push(...(data.results || []));

    if (data.has_more && data.next_cursor) {
      cursor = data.next_cursor;
      // Rate limit: 100ms between requests
      await sleep(100);
    } else {
      break;
    }
  }

  return allPages;
}

/** Build combined filter: user filter AND last_edited_time > since */
function buildQueryFilter(
  userFilter: Record<string, unknown> | null,
  since: string | null,
): Record<string, unknown> | null {
  const sinceFilter = since
    ? {
        timestamp: "last_edited_time",
        last_edited_time: { after: since },
      }
    : null;

  if (userFilter && sinceFilter) {
    // If user filter is compound (or/and), don't nest — would exceed Notion's 2-level limit
    if ("or" in userFilter || "and" in userFilter) {
      return userFilter;
    }
    return { and: [userFilter, sinceFilter] };
  }
  if (userFilter) return userFilter;
  if (sinceFilter) return sinceFilter;
  return null;
}

function parseNotionError(body: string): string {
  try {
    const parsed = JSON.parse(body);
    return parsed.message || body;
  } catch {
    return body;
  }
}

// ─── Property mapping ────────────────────────────

const WORK_FIELDS = new Set([
  "title",
  "description",
  "status_id",
  "priority",
  "due_date",
  "assignee_id",
  "assignees",
  "milestone_id",
  "company_id",
  "created_at",
  "updated_at",
]);

/** Extract a typed string value from a Notion property */
function extractPropertyValue(property: Record<string, unknown>): string | null {
  const propType = property.type as string;
  if (!propType) return null;

  switch (propType) {
    case "title": {
      const arr = property.title as Array<{ plain_text?: string }>;
      if (!Array.isArray(arr)) return null;
      const text = arr.map((rt) => rt.plain_text || "").join("");
      return text || null;
    }
    case "rich_text": {
      const arr = property.rich_text as Array<{ plain_text?: string }>;
      if (!Array.isArray(arr)) return null;
      const text = arr.map((rt) => rt.plain_text || "").join("");
      return text || null;
    }
    case "status": {
      const status = property.status as { name?: string } | null;
      return status?.name || null;
    }
    case "select": {
      const sel = property.select as { name?: string } | null;
      return sel?.name || null;
    }
    case "multi_select": {
      const arr = property.multi_select as Array<{ name?: string }>;
      if (!Array.isArray(arr) || arr.length === 0) return null;
      return arr.map((o) => o.name || "").filter(Boolean).join(", ");
    }
    case "date": {
      const date = property.date as { start?: string } | null;
      return date?.start || null;
    }
    case "people": {
      const arr = property.people as Array<{ name?: string }>;
      if (!Array.isArray(arr) || arr.length === 0) return null;
      return arr.map((p) => p.name || "").filter(Boolean).join(", ");
    }
    case "checkbox":
      return String(property.checkbox ?? false);
    case "number": {
      const n = property.number;
      if (n == null) return null;
      return Number.isInteger(n) ? String(n) : String(n);
    }
    case "url":
      return (property.url as string) || null;
    case "email":
      return (property.email as string) || null;
    case "phone_number":
      return (property.phone_number as string) || null;
    case "relation": {
      const arr = property.relation as Array<{ id?: string }>;
      if (!Array.isArray(arr) || arr.length === 0) return null;
      return arr.map((r) => r.id || "").filter(Boolean).join(", ");
    }
    default:
      return null;
  }
}

/** Apply value_map: raw Notion value → mapped value (case-insensitive) */
function applyValueMap(
  rawValue: string,
  valueMap: Record<string, unknown> | null | undefined,
): string {
  if (!valueMap || typeof valueMap !== "object") return rawValue;

  // Exact match first
  if (rawValue in valueMap) {
    const v = valueMap[rawValue];
    return typeof v === "string" ? v : typeof v === "number" ? String(v) : rawValue;
  }

  // Case-insensitive fallback
  const lower = rawValue.toLowerCase();
  for (const [k, v] of Object.entries(valueMap)) {
    if (k.toLowerCase() === lower) {
      return typeof v === "string" ? v : typeof v === "number" ? String(v) : rawValue;
    }
  }

  return rawValue;
}

/** Map a Notion page's properties to Work task fields using field_mapping */
function mapPageToTask(
  pageProperties: Record<string, unknown>,
  fieldMapping: Record<string, unknown>,
): Record<string, unknown> {
  const task: Record<string, unknown> = {};

  for (const [key, mapping] of Object.entries(fieldMapping)) {
    // Detect new vs legacy format
    const isNewFormat =
      WORK_FIELDS.has(key) ||
      (typeof mapping === "object" && mapping !== null && "source" in mapping);

    let targetField: string;
    let notionPropName: string;
    let valueMap: Record<string, unknown> | null = null;

    if (isNewFormat) {
      targetField = key;
      if (typeof mapping === "string") {
        notionPropName = mapping;
      } else if (typeof mapping === "object" && mapping !== null) {
        const obj = mapping as Record<string, unknown>;
        notionPropName = (obj.source as string) || "";
        valueMap = (obj.value_map as Record<string, unknown>) || null;
      } else {
        continue;
      }
    } else {
      // Legacy format: key = notion prop name
      if (typeof mapping === "string") {
        targetField = mapping;
        notionPropName = key;
      } else if (typeof mapping === "object" && mapping !== null) {
        const obj = mapping as Record<string, unknown>;
        targetField = (obj.target as string) || "";
        notionPropName = key;
        valueMap = (obj.value_map as Record<string, unknown>) || null;
      } else {
        continue;
      }
    }

    if (!targetField || !notionPropName) continue;

    const notionProp = pageProperties[notionPropName] as Record<string, unknown>;
    if (!notionProp) continue;

    const rawValue = extractPropertyValue(notionProp);
    if (rawValue == null) continue;

    const mappedValue = applyValueMap(rawValue, valueMap);

    // Handle special field types
    switch (targetField) {
      case "priority": {
        const p = parseInt(mappedValue, 10);
        if (!isNaN(p)) task.priority = p;
        break;
      }
      case "assignee_id":
      case "assignees": {
        // For people fields, apply value_map per person (comma-separated)
        if (rawValue.includes(",") && valueMap) {
          const resolved = rawValue
            .split(",")
            .map((name) => applyValueMap(name.trim(), valueMap))
            .join(",");
          task.assignee_id = resolved;
        } else {
          task.assignee_id = mappedValue;
        }
        break;
      }
      default:
        task[targetField] = mappedValue;
    }
  }

  return task;
}

/** Extract page title from properties (fallback when title not in field_mapping) */
function extractPageTitle(properties: Record<string, unknown>): string {
  for (const prop of Object.values(properties)) {
    const p = prop as Record<string, unknown>;
    if (p.type === "title") {
      const arr = p.title as Array<{ plain_text?: string }>;
      if (Array.isArray(arr)) {
        return arr.map((rt) => rt.plain_text || "").join("");
      }
    }
  }
  return "Untitled";
}

// ─── Sync orchestrator ───────────────────────────

async function syncConfig(config: SyncConfig): Promise<ConfigResult> {
  const apiKey = config.notion_api_key;
  if (!apiKey) {
    return {
      config_name: config.name,
      tasks_created: 0,
      tasks_updated: 0,
      error: "No Notion API key configured on this sync config",
    };
  }

  if (!config.target_project_id) {
    return {
      config_name: config.name,
      tasks_created: 0,
      tasks_updated: 0,
      error: "No target project configured",
    };
  }

  console.log(
    `[notion-sync] Syncing '${config.name}' (db: ${config.notion_database_id})`,
  );

  // Query Notion — incremental (no user filter for incremental, use last_synced_at only)
  const { pages, filterWarning } = await queryDatabase(
    config.notion_database_id,
    apiKey,
    null, // No user filter for incremental sync
    config.last_synced_at,
  );

  if (filterWarning) {
    console.warn(`[notion-sync] Filter warning for '${config.name}': ${filterWarning}`);
  }

  console.log(
    `[notion-sync] Fetched ${pages.length} pages from '${config.name}' (since=${config.last_synced_at || "none"})`,
  );

  if (pages.length === 0) {
    // Update last_synced_at even if no changes
    const now = new Date().toISOString();
    await supabase
      .from("notion_sync_configs")
      .update({ last_synced_at: now })
      .eq("id", config.id);

    return { config_name: config.name, tasks_created: 0, tasks_updated: 0 };
  }

  // Load lookup tables for resolving names → UUIDs
  const [statusesRes, usersRes, companiesRes] = await Promise.all([
    supabase.from("task_statuses").select("id,name").order("sort_order"),
    supabase.from("users").select("id,name,type").eq("type", "human"),
    supabase.from("crm_companies").select("id,name,display_name"),
  ]);

  // Status name → UUID (case-insensitive)
  const statusNameMap = new Map<string, string>();
  let defaultStatusId = "";
  for (const s of statusesRes.data || []) {
    statusNameMap.set(s.name.toLowerCase(), s.id);
    if (!defaultStatusId) defaultStatusId = s.id;
  }

  // User name → UUID (case-insensitive, also initials)
  const userNameMap = new Map<string, string>();
  for (const u of usersRes.data || []) {
    userNameMap.set(u.name.toLowerCase(), u.id);
    const initials = u.name
      .split(/\s+/)
      .map((w: string) => w[0] || "")
      .join("")
      .toLowerCase();
    if (initials) userNameMap.set(initials, u.id);
  }

  // Company name → UUID (case-insensitive)
  const companyNameMap = new Map<string, string>();
  for (const c of companiesRes.data || []) {
    if (c.display_name) companyNameMap.set(c.display_name.toLowerCase(), c.id);
    if (c.name) companyNameMap.set(c.name.toLowerCase(), c.id);
  }

  // Also add value_map entries for company_id
  const companyMapping = config.field_mapping.company_id as
    | { value_map?: Record<string, string> }
    | undefined;
  if (companyMapping?.value_map) {
    for (const [notionName, crmId] of Object.entries(companyMapping.value_map)) {
      companyNameMap.set(notionName.toLowerCase(), crmId);
    }
  }

  let tasksCreated = 0;
  let tasksUpdated = 0;

  for (const page of pages) {
    const mapped = mapPageToTask(
      page.properties as Record<string, unknown>,
      config.field_mapping,
    );

    const title =
      (mapped.title as string) || extractPageTitle(page.properties as Record<string, unknown>);

    // Resolve status_id: if not a UUID, try matching by name
    let statusId: string | null = null;
    const rawStatus = mapped.status_id as string | undefined;
    if (rawStatus) {
      if (rawStatus.length === 36 && rawStatus.includes("-")) {
        statusId = rawStatus;
      } else {
        statusId = statusNameMap.get(rawStatus.toLowerCase()) || defaultStatusId;
      }
    }
    if (!statusId) statusId = defaultStatusId;

    // Resolve assignees: comma-separated names → UUIDs
    const rawAssignee = mapped.assignee_id as string | undefined;
    const resolvedAssignees: string[] = [];
    if (rawAssignee) {
      for (const name of rawAssignee.split(",").map((s) => s.trim()).filter(Boolean)) {
        if (name.length === 36 && name.includes("-")) {
          resolvedAssignees.push(name);
        } else {
          const uid = userNameMap.get(name.toLowerCase());
          if (uid) resolvedAssignees.push(uid);
        }
      }
    }

    // Resolve company_id by name match
    let resolvedCompany: string | null = null;
    const rawCompany = mapped.company_id as string | undefined;
    if (rawCompany) {
      resolvedCompany = companyNameMap.get(rawCompany.toLowerCase()) || null;
    }

    // Timestamps
    const createdAt = (mapped.created_at as string) || page.created_time || null;
    const updatedAt = (mapped.updated_at as string) || page.last_edited_time || null;

    // Atomic upsert via RPC
    const { data: result, error: rpcError } = await supabase.rpc("sync_notion_task", {
      p_notion_page_id: page.id,
      p_target_project_id: config.target_project_id,
      p_title: title,
      p_status_id: statusId,
      p_priority: (mapped.priority as number) ?? 0,
      p_description: (mapped.description as string) || null,
      p_due_date: (mapped.due_date as string) || null,
      p_assignee_id: resolvedAssignees[0] || null,
      p_company_id: resolvedCompany,
      p_notion_content: null, // No page body fetch in incremental sync
      p_created_at: createdAt,
      p_updated_at: updatedAt,
    });

    if (rpcError) {
      console.error(`[notion-sync] RPC error for '${title}': ${rpcError.message}`);
      continue;
    }

    const action = result?.action;
    if (action === "created") tasksCreated++;
    else if (action === "updated") tasksUpdated++;

    // Sync additional assignees (RPC only handles the first one)
    if (resolvedAssignees.length > 1) {
      const { data: taskRows } = await supabase
        .from("tasks")
        .select("id")
        .eq("notion_page_id", page.id)
        .limit(1);

      const taskId = taskRows?.[0]?.id;
      if (taskId) {
        for (const uid of resolvedAssignees.slice(1)) {
          await supabase
            .from("task_assignees")
            .upsert({ task_id: taskId, user_id: uid }, { onConflict: "task_id,user_id" });
        }
      }
    }

    // Rate limit: 50ms between task operations
    await sleep(50);
  }

  // Update last_synced_at
  const now = new Date().toISOString();
  await supabase
    .from("notion_sync_configs")
    .update({ last_synced_at: now })
    .eq("id", config.id);

  console.log(
    `[notion-sync] '${config.name}' done: ${tasksCreated} created, ${tasksUpdated} updated`,
  );

  return { config_name: config.name, tasks_created: tasksCreated, tasks_updated: tasksUpdated };
}

// ─── Handler ─────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const configId = body.config_id as string | undefined;

    // Load configs
    let query = supabase
      .from("notion_sync_configs")
      .select("*")
      .eq("enabled", true)
      .order("created_at", { ascending: true });

    if (configId) {
      query = query.eq("id", configId);
    }

    const { data: configs, error: configError } = await query;
    if (configError) {
      return Response.json(
        { status: "error", message: configError.message },
        { status: 500 },
      );
    }

    if (!configs || configs.length === 0) {
      return Response.json({
        status: "ok",
        message: "No enabled sync configs found",
        results: [],
      });
    }

    const results: ConfigResult[] = [];

    for (const config of configs as SyncConfig[]) {
      try {
        const result = await syncConfig(config);
        results.push(result);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[notion-sync] Error syncing '${config.name}': ${message}`);
        results.push({
          config_name: config.name,
          tasks_created: 0,
          tasks_updated: 0,
          error: message,
        });
      }
    }

    const totalCreated = results.reduce((s, r) => s + r.tasks_created, 0);
    const totalUpdated = results.reduce((s, r) => s + r.tasks_updated, 0);
    const failed = results.filter((r) => r.error);

    return Response.json({
      status: failed.length === 0 ? "ok" : failed.length < results.length ? "partial" : "error",
      configs_synced: results.length,
      configs_failed: failed.length,
      total_created: totalCreated,
      total_updated: totalUpdated,
      results: Object.fromEntries(results.map((r) => [r.config_name, r])),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[notion-sync] Fatal error: ${message}`);
    return Response.json({ status: "error", message }, { status: 500 });
  }
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
