// Returns the currently focused entity, enriched with name + folder path.
//
// Reads the global selectedEntityStore (modules sync into it), then fetches
// the live record to get display name + cwd. Returns null if nothing's
// selected or if we don't yet have a chat-able config for that type.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAppStore } from "../stores/appStore";
import { useSelectedEntityStore, type EntityType } from "../stores/selectedEntityStore";

// Which entity types are "valid" for each module — if the global selection
// doesn't match the active module, we ignore it (likely stale from a previous
// page) and fall back to the module-level chat.
const MODULE_ALLOWED_TYPES: Record<string, EntityType[]> = {
  // Projects module can drill into tasks via the project view's task panel.
  projects: ["project", "deal", "initiative", "task"],
  work: ["task"],
  crm: ["company", "contact"],
  skills: ["skill"],
  blog: ["blog_article"],
  "mcp-tools": ["mcp_tool"],
  domains: ["domain"],
  // Metadata view operates on the same companies + contacts as CRM.
  metadata: ["company", "contact"],
};

// Human label for each module — falls back to a Title-Cased version of the id.
const MODULE_LABELS: Record<string, string> = {
  home: "Home",
  library: "Library",
  projects: "Projects",
  metadata: "Metadata",
  work: "Tasks",
  inbox: "Inbox",
  calendar: "Calendar",
  chat: "Chat",
  crm: "CRM",
  domains: "Domains",
  analytics: "Analytics",
  product: "Product",
  gallery: "Gallery",
  skills: "Skills",
  "mcp-tools": "MCP Tools",
  portal: "Portal",
  scheduler: "Scheduler",
  repos: "Repos",
  email: "Email",
  blog: "Blog",
  guides: "Guides",
  s3browser: "S3 Browser",
  prospecting: "Prospecting",
  "public-data": "Public Data",
  referrals: "Referrals",
  investment: "Investment",
  finance: "Finance",
  "shared-inbox": "Shared Inbox",
  settings: "Settings",
  // Virtual sub-scopes used by views that want a tighter scope than the module.
  companies: "Companies",
  contacts: "Contacts",
};

export interface EnrichedEntity {
  type: EntityType;
  id: string;
  name: string;
  folderPath: string | null;
}

const FETCHERS: Record<
  Exclude<EntityType, "module">,
  (id: string) => Promise<{ name: string; folderPath: string | null; typeOverride?: EntityType } | null>
> = {
  project: async (id) => {
    const { data } = await supabase
      .from("projects")
      .select("name, folder_path, project_type")
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;
    return {
      name: data.name,
      folderPath: data.folder_path ?? null,
      typeOverride: (data as any).project_type === "deal" ? "deal" : "project",
    };
  },
  deal: async (id) => {
    const { data } = await supabase
      .from("projects")
      .select("name, folder_path, project_type")
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;
    return {
      name: data.name,
      folderPath: data.folder_path ?? null,
      typeOverride: (data as any).project_type === "deal" ? "deal" : "project",
    };
  },
  task: async (id) => {
    const { data } = await supabase
      .from("tasks")
      .select("title, project:projects!tasks_project_id_fkey(folder_path)")
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;
    const proj = data.project as unknown as { folder_path: string | null } | null;
    return { name: data.title, folderPath: proj?.folder_path ?? null };
  },
  company: async (id) => {
    const { data } = await supabase
      .from("crm_companies")
      .select("name, display_name, client_folder_path")
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;
    return {
      name: (data as any).display_name || data.name,
      folderPath: (data as any).client_folder_path ?? null,
    };
  },
  contact: async (id) => {
    const { data } = await supabase
      .from("crm_contacts")
      .select("name, company:crm_companies(client_folder_path)")
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;
    const co = data.company as unknown as { client_folder_path: string | null } | null;
    return { name: data.name, folderPath: co?.client_folder_path ?? null };
  },
  initiative: async (id) => {
    const { data } = await supabase
      .from("initiatives")
      .select("name")
      .eq("id", id)
      .maybeSingle();
    return data ? { name: data.name, folderPath: null } : null;
  },
  blog_article: async (id) => {
    const { data } = await supabase
      .from("blog_articles")
      .select("title")
      .eq("id", id)
      .maybeSingle();
    return data ? { name: data.title, folderPath: null } : null;
  },
  skill: async (slug) => {
    const { data } = await supabase
      .from("skills")
      .select("name, slug")
      .eq("slug", slug)
      .maybeSingle();
    return data ? { name: data.name || data.slug, folderPath: `_skills/${slug}` } : null;
  },
  mcp_tool: async (slug) => {
    const { data } = await supabase
      .from("mcp_tools")
      .select("name, slug")
      .eq("slug", slug)
      .maybeSingle();
    return data ? { name: data.name || data.slug, folderPath: null } : null;
  },
  domain: async (id) => {
    // Domains are folder-based, not a Supabase row — the id IS the name.
    return { name: id, folderPath: `0_Platform/domains/${id}` };
  },
};

export function useSelectedEntity(): EnrichedEntity | null {
  const current = useSelectedEntityStore((s) => s.current);
  const activeModule = useAppStore((s) => s.activeModule);

  // Reject selections that don't belong to the current module — they're stale
  // leftovers from a previous page (modules don't always unmount, so their
  // sync effects can leave dangling state in the store).
  const allowedForModule = MODULE_ALLOWED_TYPES[activeModule] ?? [];
  const validCurrent =
    current && current.type !== "module" && allowedForModule.includes(current.type)
      ? current
      : null;

  const { data } = useQuery({
    queryKey: ["selected-entity-enrichment", validCurrent?.type, validCurrent?.id],
    queryFn: () =>
      validCurrent
        ? FETCHERS[validCurrent.type as Exclude<EntityType, "module">](validCurrent.id)
        : Promise.resolve(null),
    enabled: !!validCurrent,
    staleTime: 30_000,
  });

  if (validCurrent && data) {
    return {
      type: data.typeOverride ?? validCurrent.type,
      id: validCurrent.id,
      name: data.name,
      folderPath: data.folderPath,
    };
  }

  // A view inside the active module can override the module-level scope by
  // pushing { type: "module", id: <other-module> } — e.g. Metadata's
  // "companies" tab pushes "crm" so Cmd+J shows CRM Chat instead of Metadata.
  if (current?.type === "module") {
    return {
      type: "module",
      id: current.id,
      name: MODULE_LABELS[current.id] ?? current.id,
      folderPath: null,
    };
  }

  // Default fallback → active module's own chat.
  return {
    type: "module",
    id: activeModule,
    name: MODULE_LABELS[activeModule] ?? activeModule,
    folderPath: null,
  };
}
