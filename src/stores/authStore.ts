// src/stores/authStore.ts
// Authentication state management — Supabase Auth via Gateway
//
// Users authenticate via GitHub or Microsoft (Azure AD) through the gateway
// Supabase project. The gateway issues a JWT that identifies the user for
// workspace discovery and JWT minting.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";
import { gateway } from "../lib/gatewaySupabase";
import { formatError } from "../lib/formatError";
import type { Session, User } from "@supabase/supabase-js";

// OAuth callback port — must be registered in Supabase Auth redirect URLs
const OAUTH_CALLBACK_PORT = 4003;
const OAUTH_REDIRECT_URL = `http://localhost:${OAUTH_CALLBACK_PORT}/callback`;

// ─── Types ─────────────────────────────────────────────────────────────────

export type AuthProvider = "github" | "microsoft";

/** Normalized user stored after login — provider-agnostic */
export interface AppUser {
  provider: AuthProvider;
  /** Supabase Auth user ID */
  authUid: string;
  /** Provider-specific ID (GitHub numeric ID or Microsoft object ID) */
  providerId: string;
  /** GitHub login or Microsoft email */
  login: string;
  name: string;
  email: string | null;
  avatarUrl: string;
}

interface AuthState {
  user: AppUser | null;
  session: Session | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  signInWithGitHub: () => Promise<void>;
  signInWithMicrosoft: () => Promise<void>;
  signOut: () => void;
  clearError: () => void;

  // Session helpers
  getAccessToken: () => string | null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function supabaseUserToAppUser(user: User): AppUser {
  const provider = user.app_metadata?.provider as string;
  const meta = user.user_metadata ?? {};

  // Determine provider-specific fields
  const isGitHub = provider === "github";
  const login = isGitHub
    ? (meta.user_name || meta.preferred_username || user.email || "")
    : (user.email || meta.email || "");

  return {
    provider: isGitHub ? "github" : "microsoft",
    authUid: user.id,
    providerId: meta.provider_id || meta.sub || user.id,
    login,
    name: meta.full_name || meta.name || login,
    email: user.email || meta.email || null,
    avatarUrl: meta.avatar_url || "",
  };
}

/**
 * Run the OAuth browser flow via Tauri:
 * 1. Get the auth URL from Supabase (PKCE flow)
 * 2. Open browser + listen for callback via Tauri
 * 3. Exchange the code for a Supabase session
 */
async function runOAuthFlow(provider: "github" | "azure"): Promise<void> {
  // 1. Get the OAuth URL from Supabase (PKCE generates code_verifier internally)
  const { data, error } = await gateway.auth.signInWithOAuth({
    provider,
    options: {
      skipBrowserRedirect: true,
      redirectTo: OAUTH_REDIRECT_URL,
    },
  });

  if (error || !data?.url) {
    throw new Error(error?.message || "Failed to get OAuth URL");
  }

  // 2. Open browser and wait for callback code via Tauri backend
  const code = await invoke<string>("oauth_browser_flow", {
    url: data.url,
    port: OAUTH_CALLBACK_PORT,
  });

  // 3. Exchange the code for a Supabase session
  const { error: exchangeError } = await gateway.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    throw new Error(exchangeError.message);
  }
}

// ─── Store ─────────────────────────────────────────────────────────────────

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      session: null,
      isLoading: false,
      isInitialized: false,
      error: null,

      initialize: async () => {
        try {
          // Check for existing Supabase Auth session
          const { data: { session } } = await gateway.auth.getSession();

          if (session?.user) {
            set({
              user: supabaseUserToAppUser(session.user),
              session,
              isInitialized: true,
              isLoading: false,
            });
          } else {
            set({ isInitialized: true, isLoading: false });
          }

          // Listen for auth state changes (token refresh, sign out, etc.)
          gateway.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
              set({
                user: supabaseUserToAppUser(session.user),
                session,
              });
            } else {
              set({ user: null, session: null });
            }
          });
        } catch (error) {
          console.error("Failed to initialize auth:", error);
          set({ isInitialized: true, isLoading: false });
        }
      },

      signInWithGitHub: async () => {
        set({ isLoading: true, error: null });
        try {
          await runOAuthFlow("github");

          // Session is now set via onAuthStateChange, but we also
          // fetch it explicitly to update state immediately
          const { data: { session } } = await gateway.auth.getSession();
          if (session?.user) {
            set({
              user: supabaseUserToAppUser(session.user),
              session,
              isLoading: false,
            });
          }
        } catch (error) {
          set({ error: formatError(error), isLoading: false });
        }
      },

      signInWithMicrosoft: async () => {
        set({ isLoading: true, error: null });
        try {
          await runOAuthFlow("azure");

          const { data: { session } } = await gateway.auth.getSession();
          if (session?.user) {
            set({
              user: supabaseUserToAppUser(session.user),
              session,
              isLoading: false,
            });
          }
        } catch (error) {
          set({ error: formatError(error), isLoading: false });
        }
      },

      signOut: () => {
        gateway.auth.signOut();
        set({
          user: null,
          session: null,
          error: null,
        });
      },

      clearError: () => {
        set({ error: null });
      },

      getAccessToken: () => {
        return get().session?.access_token ?? null;
      },
    }),
    {
      name: "tv-client-auth",
      partialize: (state) => ({
        // Don't persist the session — Supabase Auth handles its own storage.
        // We only persist the normalized user for instant UI rendering.
        user: state.user,
      }),
    },
  ),
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
    id: user.authUid,
    providerId: user.providerId,
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

/** Get the provider's OAuth token (e.g., GitHub token for API calls).
 *  Available from the Supabase Auth session's provider_token. */
export function useProviderToken(): string | null {
  const session = useAuth((s) => s.session);
  return session?.provider_token ?? null;
}

// Legacy exports for backward compatibility during migration
export const isGitHubConfigured = true;
