// ---------------------------------------------------------------------------
// Workspace store — manages multi-workspace switching
//
// Each workspace is a separate Supabase project. This store tracks which
// workspaces the user has access to and orchestrates the full switch flow:
// credentials update, localStorage namespace swap, and app reload.
// ---------------------------------------------------------------------------

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";
import { gateway } from "../lib/gatewaySupabase";
import { initWorkspaceClient } from "../lib/supabase";
import { queryClient } from "../main";
import {
  switchLocalStorage,
  migrateExistingLocalStorage,
} from "../lib/workspaceStorage";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Workspace {
  id: string;
  slug: string;
  displayName: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  iconEmoji: string;
  color: string;
  role: string;
}

interface WorkspaceState {
  /** All workspaces this user can access (cached from gateway). */
  workspaces: Workspace[];
  /** Currently active workspace ID. */
  activeWorkspaceId: string | null;
  /** True while loading workspaces from gateway. */
  isLoading: boolean;

  // Actions
  loadWorkspaces: () => Promise<void>;
  selectWorkspace: (workspaceId: string) => Promise<void>;
  getActiveWorkspace: () => Workspace | null;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      workspaces: [],
      activeWorkspaceId: null,
      isLoading: false,

      loadWorkspaces: async () => {
        set({ isLoading: true });
        try {
          // Query gateway for workspaces the current user can access.
          // The gateway RLS ensures only the user's memberships are returned.
          const { data, error } = await gateway
            .from("workspace_memberships")
            .select(
              `
              role,
              workspace:workspaces (
                id, slug, display_name, supabase_url, supabase_anon_key,
                icon_emoji, color
              )
            `,
            )
            .order("created_at", { ascending: true });

          if (error) throw error;

          const workspaces: Workspace[] = (data ?? [])
            .filter((row: any) => row.workspace)
            .map((row: any) => ({
              id: row.workspace.id,
              slug: row.workspace.slug,
              displayName: row.workspace.display_name,
              supabaseUrl: row.workspace.supabase_url,
              supabaseAnonKey: row.workspace.supabase_anon_key,
              iconEmoji: row.workspace.icon_emoji ?? "🏢",
              color: row.workspace.color ?? "#14b8a6",
              role: row.role,
            }));

          set({ workspaces, isLoading: false });

          // Auto-select if only one workspace and none previously selected
          const { activeWorkspaceId } = get();
          if (!activeWorkspaceId && workspaces.length === 1) {
            await get().selectWorkspace(workspaces[0].id);
          }
        } catch (err) {
          console.error("Failed to load workspaces from gateway:", err);
          set({ isLoading: false });
          // Fall through — the cached workspaces list (from persist) is still
          // usable, so the app can boot even if the gateway is unreachable.
        }
      },

      selectWorkspace: async (workspaceId: string) => {
        const { workspaces, activeWorkspaceId: oldId } = get();
        const workspace = workspaces.find((w) => w.id === workspaceId);
        if (!workspace) {
          console.error("Workspace not found:", workspaceId);
          return;
        }

        // 1. Run one-time migration for pre-workspace installs
        if (oldId === null) {
          migrateExistingLocalStorage(workspaceId);
        }

        // 2. Swap localStorage namespaces
        switchLocalStorage(oldId, workspaceId);

        // 3. Push credentials to Tauri backend atomically
        const keys: Record<string, string> = {
          supabase_url: workspace.supabaseUrl,
          supabase_anon_key: workspace.supabaseAnonKey,
        };

        // Also load workspace-specific settings from gateway
        try {
          const { data: wsSettings } = await gateway
            .from("workspace_settings")
            .select("key, value")
            .eq("workspace_id", workspaceId);

          if (wsSettings) {
            for (const row of wsSettings) {
              keys[row.key] = row.value;
            }
          }
        } catch {
          // Non-fatal — core credentials are already in `keys`
        }

        await invoke("settings_switch_workspace", { keys });

        // 4. Clear React Query cache (prevents stale data from old workspace)
        queryClient.clear();

        // 5. Initialize the new Supabase client
        initWorkspaceClient(workspace.supabaseUrl, workspace.supabaseAnonKey);

        // 6. Persist the selection
        set({ activeWorkspaceId: workspaceId });

        // 7. If switching (not initial selection), reload to reset all stores
        if (oldId !== null && oldId !== workspaceId) {
          window.location.reload();
        }
      },

      getActiveWorkspace: () => {
        const { workspaces, activeWorkspaceId } = get();
        return workspaces.find((w) => w.id === activeWorkspaceId) ?? null;
      },
    }),
    {
      name: "tv-client-workspace",
      partialize: (state) => ({
        workspaces: state.workspaces,
        activeWorkspaceId: state.activeWorkspaceId,
      }),
    },
  ),
);
