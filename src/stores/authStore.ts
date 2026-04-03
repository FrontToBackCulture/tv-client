// src/stores/authStore.ts
// Authentication state management — GitHub OAuth + Microsoft 365 OAuth

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";
import { formatError } from "../lib/formatError";

const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = import.meta.env.VITE_GITHUB_CLIENT_SECRET;

// ─── Types ─────────────────────────────────────────────────────────────────

export type AuthProvider = "github" | "microsoft";

interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

interface MicrosoftUser {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
}

interface OAuthResult {
  access_token: string;
  user: GitHubUser;
}

interface MicrosoftOAuthResult {
  access_token: string;
  user: MicrosoftUser;
}

/** Normalized user stored after login — provider-agnostic */
export interface AppUser {
  provider: AuthProvider;
  /** GitHub numeric ID or Microsoft object ID */
  providerId: string;
  /** GitHub login or Microsoft email */
  login: string;
  name: string;
  email: string | null;
  avatarUrl: string;
}

interface AuthState {
  user: AppUser | null;
  accessToken: string | null;
  provider: AuthProvider | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  signInWithGitHub: () => Promise<void>;
  signInWithMicrosoft: () => Promise<void>;
  signOut: () => void;
  clearError: () => void;
}

// Check if GitHub is configured
export const isGitHubConfigured = Boolean(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET);

// ─── Helpers ───────────────────────────────────────────────────────────────

function githubUserToAppUser(user: GitHubUser): AppUser {
  return {
    provider: "github",
    providerId: String(user.id),
    login: user.login,
    name: user.name || user.login,
    email: user.email,
    avatarUrl: user.avatar_url,
  };
}

function microsoftUserToAppUser(user: MicrosoftUser): AppUser {
  return {
    provider: "microsoft",
    providerId: user.id,
    login: user.email, // Use email as the login identifier
    name: user.name || user.email || "User",
    email: user.email,
    avatarUrl: user.avatar_url || "",
  };
}

/** Load MS Graph credentials from Tauri settings store */
async function getMsGraphCredentials(): Promise<{ clientId: string; tenantId: string; clientSecret: string } | null> {
  try {
    const clientId = await invoke<string | null>("settings_get_key", { keyName: "ms_graph_client_id" });
    const tenantId = await invoke<string | null>("settings_get_key", { keyName: "ms_graph_tenant_id" });
    const clientSecret = await invoke<string | null>("settings_get_key", { keyName: "ms_graph_client_secret" });
    if (clientId && tenantId && clientSecret) {
      return { clientId, tenantId, clientSecret };
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Store ─────────────────────────────────────────────────────────────────

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      provider: null,
      isLoading: false,
      isInitialized: false,
      error: null,

      initialize: async () => {
        const { accessToken, provider } = get();

        if (!accessToken || !provider) {
          set({ isInitialized: true });
          return;
        }

        set({ isLoading: true });

        try {
          if (provider === "github") {
            const ghUser = await invoke<GitHubUser>("github_get_user", { accessToken });
            set({
              user: githubUserToAppUser(ghUser),
              isInitialized: true,
              isLoading: false,
            });
          } else if (provider === "microsoft") {
            const msUser = await invoke<MicrosoftUser>("microsoft_get_user", { accessToken });
            set({
              user: microsoftUserToAppUser(msUser),
              isInitialized: true,
              isLoading: false,
            });
          }
        } catch (error) {
          // Token is invalid, clear it
          console.error("Failed to validate token:", error);
          set({
            user: null,
            accessToken: null,
            provider: null,
            isInitialized: true,
            isLoading: false,
          });
        }
      },

      signInWithGitHub: async () => {
        if (!isGitHubConfigured) {
          set({ error: "GitHub credentials not configured" });
          return;
        }

        set({ isLoading: true, error: null });

        try {
          const result = await invoke<OAuthResult>("github_oauth_start", {
            clientId: GITHUB_CLIENT_ID,
            clientSecret: GITHUB_CLIENT_SECRET,
          });

          set({
            user: githubUserToAppUser(result.user),
            accessToken: result.access_token,
            provider: "github",
            isLoading: false,
          });
        } catch (error) {
          set({
            error: formatError(error),
            isLoading: false,
          });
        }
      },

      signInWithMicrosoft: async () => {
        set({ isLoading: true, error: null });

        try {
          const creds = await getMsGraphCredentials();
          if (!creds) {
            set({
              error: "Microsoft 365 credentials not configured. Add MS Graph Client ID, Tenant ID, and Client Secret in Settings.",
              isLoading: false,
            });
            return;
          }

          const result = await invoke<MicrosoftOAuthResult>("microsoft_oauth_start", {
            clientId: creds.clientId,
            tenantId: creds.tenantId,
            clientSecret: creds.clientSecret,
          });

          set({
            user: microsoftUserToAppUser(result.user),
            accessToken: result.access_token,
            provider: "microsoft",
            isLoading: false,
          });
        } catch (error) {
          set({
            error: formatError(error),
            isLoading: false,
          });
        }
      },

      signOut: () => {
        set({
          user: null,
          accessToken: null,
          provider: null,
          error: null,
        });
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: "tv-client-auth",
      partialize: (state) => ({
        accessToken: state.accessToken,
        user: state.user,
        provider: state.provider,
      }),
    }
  )
);

// ─── Helper hooks ──────────────────────────────────────────────────────────

/** Check if user is authenticated */
export function useIsAuthenticated(): boolean {
  const user = useAuth((state) => state.user);
  return user !== null;
}

/** Get normalized user display info */
export function useUserInfo() {
  const user = useAuth((state) => state.user);

  if (!user) return null;

  return {
    id: user.providerId,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    /** GitHub username or Microsoft email */
    login: user.login,
    provider: user.provider,
    // Legacy compat — some components reference this
    githubUsername: user.provider === "github" ? user.login : null,
  };
}
