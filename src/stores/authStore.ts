// src/stores/authStore.ts
// Authentication state management with GitHub OAuth

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";

const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = import.meta.env.VITE_GITHUB_CLIENT_SECRET;

interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

interface OAuthResult {
  access_token: string;
  user: GitHubUser;
}

interface AuthState {
  user: GitHubUser | null;
  accessToken: string | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  signInWithGitHub: () => Promise<void>;
  signOut: () => void;
  clearError: () => void;
}

// Check if GitHub is configured
export const isGitHubConfigured = Boolean(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET);

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      isLoading: false,
      isInitialized: false,
      error: null,

      initialize: async () => {
        const { accessToken } = get();

        if (!accessToken) {
          set({ isInitialized: true });
          return;
        }

        set({ isLoading: true });

        try {
          // Validate token and get user info via Tauri
          const user = await invoke<GitHubUser>("github_get_user", {
            accessToken,
          });
          set({
            user,
            isInitialized: true,
            isLoading: false,
          });
        } catch (error) {
          // Token is invalid, clear it
          console.error("Failed to validate token:", error);
          set({
            user: null,
            accessToken: null,
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
          // Start OAuth flow - opens browser, waits for callback
          const result = await invoke<OAuthResult>("github_oauth_start", {
            clientId: GITHUB_CLIENT_ID,
            clientSecret: GITHUB_CLIENT_SECRET,
          });

          set({
            user: result.user,
            accessToken: result.access_token,
            isLoading: false,
          });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : String(error),
            isLoading: false,
          });
        }
      },

      signOut: () => {
        set({
          user: null,
          accessToken: null,
          error: null,
        });
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: "tv-desktop-auth",
      partialize: (state) => ({
        // Persist token and user
        accessToken: state.accessToken,
        user: state.user,
      }),
    }
  )
);

// Helper hook to check if user is authenticated
export function useIsAuthenticated(): boolean {
  const user = useAuth((state) => state.user);
  return user !== null;
}

// Helper to get user display info
export function useUserInfo() {
  const user = useAuth((state) => state.user);

  if (!user) return null;

  return {
    id: String(user.id),
    email: user.email,
    name: user.name || user.login,
    avatarUrl: user.avatar_url,
    githubUsername: user.login,
  };
}
