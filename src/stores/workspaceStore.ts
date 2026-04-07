// ---------------------------------------------------------------------------
// Workspace store — manages multi-workspace switching
//
// Each workspace is a separate Supabase project. This store tracks which
// workspaces the user has access to and orchestrates the full switch flow:
// credentials update, localStorage namespace swap, workspace JWT minting,
// and app reload.
// ---------------------------------------------------------------------------

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";
import { gateway, GATEWAY_URL } from "../lib/gatewaySupabase";
import { initWorkspaceClient } from "../lib/supabase";
import { queryClient } from "../main";
import {
  getActiveWorkspaceId,
  setActiveWorkspaceId,
} from "../lib/workspaceScopedStorage";
import { useAuth } from "./authStore";

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
  /** Module IDs available in this workspace. null = all modules. */
  modules: string[] | null;
}

interface WorkspaceToken {
  token: string;
  expiresAt: number; // unix timestamp
  userId: string;
  role: string;
  permissions: string[];
}

interface WorkspaceState {
  /** All workspaces this user can access (cached from gateway). */
  workspaces: Workspace[];
  /** Currently active workspace ID. */
  activeWorkspaceId: string | null;
  /** Workspace JWT for the active workspace. */
  workspaceToken: WorkspaceToken | null;
  /** True while loading workspaces from gateway. */
  isLoading: boolean;

  // Actions
  loadWorkspaces: () => Promise<void>;
  selectWorkspace: (workspaceId: string) => Promise<void>;
  getActiveWorkspace: () => Workspace | null;
  refreshWorkspaceToken: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fetch a workspace-scoped JWT from the gateway Edge Function. */
async function mintWorkspaceToken(workspaceId: string): Promise<WorkspaceToken> {
  const accessToken = useAuth.getState().getAccessToken();
  if (!accessToken) {
    throw new Error("Not authenticated — sign in first");
  }

  const response = await fetch(
    `${GATEWAY_URL}/functions/v1/workspace-token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ workspace_id: workspaceId }),
    },
  );

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Failed to mint workspace token (${response.status})`);
  }

  const data = await response.json();
  return {
    token: data.token,
    expiresAt: data.expires_at,
    userId: data.user.id,
    role: data.user.role,
    permissions: data.user.permissions,
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      workspaces: [],
      // Seeded from sessionStorage (per-window). The persist layer only
      // keeps `workspaces`; the active ID lives in sessionStorage so two
      // windows can point at different workspaces simultaneously.
      activeWorkspaceId: getActiveWorkspaceId(),
      workspaceToken: null,
      isLoading: false,

      loadWorkspaces: async () => {
        set({ isLoading: true });
        try {
          // Query gateway for workspaces the current user can access.
          // With Supabase Auth, RLS filters to only this user's memberships.
          const { data, error } = await gateway
            .from("workspace_memberships")
            .select(
              `
              role,
              workspace:workspaces (
                id, slug, display_name, supabase_url, supabase_anon_key,
                icon_emoji, color, modules
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
              modules: row.workspace.modules ?? null,
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

        // 1. Record the active workspace for this window. sessionStorage
        // isolates per-window so two windows can run different workspaces
        // side-by-side; localStorage stores a "last used" fallback for
        // brand-new windows. All workspace-scoped stores read from
        // `${name}::${workspaceId}` keys, so no manual swap is needed.
        setActiveWorkspaceId(workspaceId);

        // 2. Mint a workspace JWT via the gateway Edge Function
        let wsToken: WorkspaceToken | null = null;
        try {
          wsToken = await mintWorkspaceToken(workspaceId);
          set({ workspaceToken: wsToken });
        } catch (err) {
          console.error("Failed to mint workspace token:", err);
          // Fall through — workspace will work with anon key (degraded mode)
        }

        // 3. Push credentials to Tauri backend.
        //
        // `settings_register_workspace` writes keys under BOTH a
        // workspace-scoped namespace (`ws:{id}:supabase_url`) AND the
        // global unscoped slot. The scoped copies are what Rust background
        // sync loops read (via `WORKSPACE_OVERRIDE` task-local), so each
        // workspace's bg syncs target their own Supabase project without
        // other windows clobbering them. The global copies are retained
        // for legacy code paths that don't know about workspaces — they
        // remain last-writer-wins, which is fine because the frontend
        // boot path now uses in-memory workspace data instead (see
        // App.tsx boot init).
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

        await invoke("settings_register_workspace", {
          workspaceId,
          keys,
        });

        // 4. Clear React Query cache (prevents stale data from old workspace)
        queryClient.clear();

        // 5. Initialize the new Supabase client with workspace JWT
        const client = initWorkspaceClient(
          workspace.supabaseUrl,
          workspace.supabaseAnonKey,
        );

        // Set the workspace JWT as the auth session so RLS works
        if (wsToken) {
          await client.auth.setSession({
            access_token: wsToken.token,
            refresh_token: "", // Custom JWTs don't have refresh tokens
          });
        }

        // 6. Persist the selection
        set({ activeWorkspaceId: workspaceId });

        // 7. If switching (not initial selection), reload so every
        // workspace-scoped store re-hydrates from the new namespace.
        if (oldId !== null && oldId !== workspaceId) {
          window.location.reload();
        }
      },

      getActiveWorkspace: () => {
        const { workspaces, activeWorkspaceId } = get();
        return workspaces.find((w) => w.id === activeWorkspaceId) ?? null;
      },

      refreshWorkspaceToken: async () => {
        const { activeWorkspaceId } = get();
        if (!activeWorkspaceId) return;

        try {
          const wsToken = await mintWorkspaceToken(activeWorkspaceId);
          set({ workspaceToken: wsToken });

          // Update the active Supabase client session
          const { getSupabaseClient } = await import("../lib/supabase");
          const client = getSupabaseClient();
          await client.auth.setSession({
            access_token: wsToken.token,
            refresh_token: "",
          });
        } catch (err) {
          console.error("Failed to refresh workspace token:", err);
        }
      },
    }),
    {
      name: "tv-client-workspace",
      partialize: (state) => ({
        workspaces: state.workspaces,
        // Don't persist `activeWorkspaceId` — it's per-window and lives in
        // sessionStorage (see workspaceScopedStorage.ts). Persisting it here
        // would make two windows fight over which workspace is "active".
        // Don't persist the token — re-mint on each app start.
      }),
      // Explicit merge: ignore any legacy `activeWorkspaceId` left in
      // persisted storage from before this change. The initializer already
      // seeded it from sessionStorage.
      merge: (persisted, current) => {
        const p = (persisted as Partial<WorkspaceState>) ?? {};
        return {
          ...current,
          workspaces: p.workspaces ?? current.workspaces,
        };
      },
    },
  ),
);
