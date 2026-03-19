// src/stores/teamConfigStore.ts
// Team configuration store — backed by Supabase users table

import { create } from "zustand";
import { supabase } from "../lib/supabase";
import { useAuth } from "./authStore";
import type { ModuleId } from "./appStore";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TeamMember {
  name: string;
  email: string;
  avatarUrl: string;
  role: "admin" | "member";
  lastSeen: string;
  visibleModules: ModuleId[] | null; // null = all modules visible
}

export interface TeamConfig {
  version: number;
  updated: string;
  defaults: {
    visibleModules: ModuleId[];
  };
  members: Record<string, TeamMember>;
}

interface TeamConfigState {
  config: TeamConfig | null;
  isLoaded: boolean;
  error: string | null;

  // Actions
  loadConfig: () => Promise<void>;
  registerCurrentUser: () => Promise<void>;
  getVisibleModules: (login: string) => ModuleId[] | "all";
  setMemberModules: (login: string, modules: ModuleId[]) => Promise<void>;
  getAllMembers: () => Record<string, TeamMember>;
  isAdmin: (login: string) => boolean;
}

const DEFAULT_VISIBLE_MODULES: ModuleId[] = ["home", "library", "projects", "domains", "skills"];

// Legacy module IDs that were consolidated into "projects"
const LEGACY_PROJECT_MODULES = new Set(["work", "workspace", "crm"]);

function migrateVisibleModules(modules: string[] | null): ModuleId[] | null {
  if (!modules) return null;
  const hasLegacy = modules.some((m) => LEGACY_PROJECT_MODULES.has(m));
  if (!hasLegacy) return modules as ModuleId[];
  // Replace legacy modules with "projects"
  const migrated = modules.filter((m) => !LEGACY_PROJECT_MODULES.has(m));
  if (!migrated.includes("projects")) migrated.push("projects");
  return migrated as ModuleId[];
}

function mapRowToMember(row: {
  name: string;
  email: string | null;
  avatar_url: string | null;
  role: string;
  last_active_at: string | null;
  visible_modules: string[] | null;
}): TeamMember {
  return {
    name: row.name,
    email: row.email || "",
    avatarUrl: row.avatar_url || "",
    role: (row.role === "admin" ? "admin" : "member") as "admin" | "member",
    lastSeen: row.last_active_at || "",
    visibleModules: migrateVisibleModules(row.visible_modules),
  };
}

export const useTeamConfigStore = create<TeamConfigState>((set, get) => ({
  config: null,
  isLoaded: false,
  error: null,

  loadConfig: async () => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("github_username, name, email, avatar_url, role, last_active_at, visible_modules")
        .eq("type", "human")
        .order("name");

      if (error) throw error;

      const members: Record<string, TeamMember> = {};
      const migrateUpdates: Array<{ username: string; modules: ModuleId[] }> = [];
      for (const row of data ?? []) {
        if (row.github_username) {
          members[row.github_username] = mapRowToMember(row);
          // Queue Supabase update if migration changed the modules
          const migrated = migrateVisibleModules(row.visible_modules);
          if (row.visible_modules && migrated &&
              JSON.stringify(row.visible_modules.sort()) !== JSON.stringify([...migrated].sort())) {
            migrateUpdates.push({ username: row.github_username, modules: migrated });
          }
        }
      }

      // Persist legacy → projects migration back to Supabase (fire-and-forget)
      for (const { username, modules } of migrateUpdates) {
        supabase.from("users").update({ visible_modules: modules })
          .eq("github_username", username).then(({ error: e }) => {
            if (e) console.warn(`Failed to persist module migration for ${username}:`, e);
            else console.log(`Migrated visible_modules for ${username}: replaced legacy work/crm/workspace with projects`);
          });
      }

      const config: TeamConfig = {
        version: 1,
        updated: new Date().toISOString(),
        defaults: { visibleModules: DEFAULT_VISIBLE_MODULES },
        members,
      };

      set({ config, isLoaded: true, error: null });
    } catch (err) {
      console.error("Failed to load team config:", err);
      set({ isLoaded: true, error: String(err) });
    }
  },

  registerCurrentUser: async () => {
    const user = useAuth.getState().user;
    if (!user) return;

    const login = user.login;
    const now = new Date().toISOString();

    try {
      const { error } = await supabase.from("users").upsert(
        {
          github_username: login,
          github_id: user.id,
          name: user.name || user.login,
          email: user.email || null,
          avatar_url: user.avatar_url,
          role: (login === "melvinFTBC" || login === "melvinwang") ? "admin" : "member",
          type: "human",
          last_active_at: now,
        },
        { onConflict: "github_username" }
      );

      if (error) throw error;

      // Refresh config to pick up the upserted row
      await get().loadConfig();
    } catch (err) {
      console.error("Failed to register user in team config:", err);
    }
  },

  getVisibleModules: (login: string) => {
    const { config } = get();
    if (!config) return "all";

    const member = config.members[login];
    if (!member) return "all";

    // Admin with no explicit config = see everything
    // Admin with explicit config = respect it (they set it themselves)
    if (get().isAdmin(login) && member.visibleModules === null) return "all";

    // null visible_modules = use defaults
    if (member.visibleModules === null) {
      return config.defaults.visibleModules;
    }

    return member.visibleModules;
  },

  setMemberModules: async (login: string, modules: ModuleId[]) => {
    try {
      const { error } = await supabase
        .from("users")
        .update({ visible_modules: modules })
        .eq("github_username", login);

      if (error) throw error;

      // Update in-memory cache
      const { config } = get();
      if (config && config.members[login]) {
        const updatedConfig: TeamConfig = {
          ...config,
          members: {
            ...config.members,
            [login]: {
              ...config.members[login],
              visibleModules: modules,
            },
          },
        };
        set({ config: updatedConfig });
      }
    } catch (err) {
      console.error("Failed to update member modules:", err);
    }
  },

  getAllMembers: () => {
    const { config } = get();
    if (!config) return {};
    return config.members;
  },

  isAdmin: (login: string) => {
    return login === "melvinFTBC" || login === "melvinwang";
  },
}));
