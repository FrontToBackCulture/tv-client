// src/stores/teamConfigStore.ts
// Team configuration store — backed by Supabase users table
// Supports identity lookup by github_username OR microsoft_email

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
  /** Keyed by canonical login (github_username or microsoft_email) */
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

// Admin identifiers — GitHub usernames or Microsoft emails
const ADMIN_LOGINS = new Set(["melvinFTBC", "melvinwang", "melvin@thinkval.com"]);

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
        .select("github_username, microsoft_email, name, email, avatar_url, role, last_active_at, visible_modules")
        .eq("type", "human")
        .order("name");

      if (error) throw error;

      const members: Record<string, TeamMember> = {};
      const migrateUpdates: Array<{ username: string; modules: ModuleId[] }> = [];
      for (const row of data ?? []) {
        // Key by github_username if available, otherwise microsoft_email
        const key = row.github_username || row.microsoft_email;
        if (key) {
          members[key] = mapRowToMember(row);
          // Also index by the other identity if both exist
          if (row.github_username && row.microsoft_email) {
            members[row.microsoft_email] = mapRowToMember(row);
          }
          // Queue Supabase update if migration changed the modules
          const migrated = migrateVisibleModules(row.visible_modules);
          if (row.visible_modules && migrated &&
              JSON.stringify(row.visible_modules.sort()) !== JSON.stringify([...migrated].sort())) {
            if (row.github_username) {
              migrateUpdates.push({ username: row.github_username, modules: migrated });
            }
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
    const appUser = useAuth.getState().user;
    if (!appUser) return;

    const now = new Date().toISOString();

    try {
      if (appUser.provider === "github") {
        // GitHub login — upsert on github_username
        const { error } = await supabase.from("users").upsert(
          {
            github_username: appUser.login,
            github_id: Number(appUser.providerId),
            name: appUser.name,
            email: appUser.email || null,
            avatar_url: appUser.avatarUrl,
            role: ADMIN_LOGINS.has(appUser.login) ? "admin" : "member",
            type: "human",
            last_active_at: now,
          },
          { onConflict: "github_username" }
        );
        if (error) throw error;
      } else if (appUser.provider === "microsoft") {
        // Microsoft login — resolve to existing user row
        const msEmail = appUser.email!;

        // Try matching by: microsoft_email → email → name (in priority order)
        const { data: allHumans } = await supabase
          .from("users")
          .select("id, github_username, email, microsoft_email, name")
          .eq("type", "human");

        const candidates = allHumans ?? [];
        console.log("[teamConfig] Microsoft login matching:", { msEmail, appUserName: appUser.name, candidateCount: candidates.length, candidates: candidates.map(c => ({ name: c.name, ms: c.microsoft_email, email: c.email, gh: c.github_username })) });
        const existing =
          candidates.find((u) => u.microsoft_email === msEmail) ||
          candidates.find((u) => u.email === msEmail) ||
          candidates.find((u) => u.name === appUser.name);

        if (existing) {
          // Link Microsoft identity to existing user row
          const { error } = await supabase.from("users")
            .update({
              microsoft_email: msEmail,
              microsoft_id: appUser.providerId,
              last_active_at: now,
            })
            .eq("id", existing.id);
          if (error) throw error;

          // Patch auth store login to the canonical team key so the rest
          // of the app (visible modules, tasks, notifications) resolves
          // to the same identity regardless of login provider.
          const canonicalLogin = existing.github_username || msEmail;
          if (canonicalLogin !== appUser.login) {
            useAuth.setState((s) => ({
              user: s.user ? { ...s.user, login: canonicalLogin, name: existing.name || s.user.name } : null,
            }));
          }
        } else {
          // No existing user found — create new row
          // (genuinely new team member, not an unlinked existing one)
          const { error } = await supabase.from("users").insert({
            microsoft_email: msEmail,
            microsoft_id: appUser.providerId,
            name: appUser.name,
            email: msEmail,
            avatar_url: appUser.avatarUrl || null,
            role: ADMIN_LOGINS.has(msEmail) ? "admin" : "member",
            type: "human",
            last_active_at: now,
          });
          if (error) throw error;
        }
      }

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

    // Admins always see everything — regardless of visible_modules setting
    if (get().isAdmin(login)) return "all";

    // null visible_modules = use defaults
    if (member.visibleModules === null) {
      return config.defaults.visibleModules;
    }

    return member.visibleModules;
  },

  setMemberModules: async (login: string, modules: ModuleId[]) => {
    try {
      // Try github_username first, then microsoft_email
      let result = await supabase
        .from("users")
        .update({ visible_modules: modules })
        .eq("github_username", login);

      // If no rows matched, try microsoft_email
      if (!result.error && result.count === 0) {
        result = await supabase
          .from("users")
          .update({ visible_modules: modules })
          .eq("microsoft_email", login);
      }

      if (result.error) throw result.error;

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
    return ADMIN_LOGINS.has(login);
  },
}));
