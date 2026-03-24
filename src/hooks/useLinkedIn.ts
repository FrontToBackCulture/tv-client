// React Query hooks for LinkedIn (OAuth + Posts API)
// All data comes from Rust backend via Tauri IPC

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

// ============================================================================
// Types (match Rust types)
// ============================================================================

export interface LinkedInAuthStatus {
  isAuthenticated: boolean;
  userName: string | null;
  userSub: string | null;
  expiresAt: number | null;
}

export interface LinkedInUserInfo {
  sub: string;
  name: string | null;
  givenName: string | null;
  familyName: string | null;
  picture: string | null;
  email: string | null;
  emailVerified: boolean | null;
}

export interface LinkedInPost {
  id: string;
  text: string;
  createdAt: string;
  lifecycleState: string;
  visibility: string;
  numLikes: number;
  numComments: number;
  numShares: number;
  numImpressions: number;
}

// ============================================================================
// Query keys
// ============================================================================

export const linkedInKeys = {
  all: ["linkedin"] as const,
  auth: () => ["linkedin", "auth"] as const,
  profile: () => ["linkedin", "profile"] as const,
  posts: (count?: number) => ["linkedin", "posts", count] as const,
};

// ============================================================================
// Auth hooks
// ============================================================================

export function useLinkedInAuth() {
  return useQuery({
    queryKey: linkedInKeys.auth(),
    queryFn: () => invoke<LinkedInAuthStatus>("linkedin_auth_check"),
    staleTime: 1000 * 60 * 5, // 5 min
  });
}

export function useLinkedInLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      clientId,
      clientSecret,
    }: {
      clientId: string;
      clientSecret: string;
    }) =>
      invoke<LinkedInAuthStatus>("linkedin_auth_start", {
        clientId,
        clientSecret,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: linkedInKeys.auth() });
    },
  });
}

export function useLinkedInLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => invoke<void>("linkedin_auth_logout"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: linkedInKeys.all });
    },
  });
}

// ============================================================================
// Profile hooks
// ============================================================================

export function useLinkedInProfile() {
  const { data: auth } = useLinkedInAuth();

  return useQuery({
    queryKey: linkedInKeys.profile(),
    queryFn: () => invoke<LinkedInUserInfo>("linkedin_get_profile"),
    enabled: auth?.isAuthenticated === true,
    staleTime: 1000 * 60 * 30, // 30 min
  });
}

// ============================================================================
// Post hooks
// ============================================================================

export function useLinkedInPosts(count?: number) {
  const { data: auth } = useLinkedInAuth();

  return useQuery({
    queryKey: linkedInKeys.posts(count),
    queryFn: () => invoke<LinkedInPost[]>("linkedin_get_posts", { count }),
    enabled: auth?.isAuthenticated === true,
    staleTime: 1000 * 60 * 2, // 2 min
  });
}

export function useCreateLinkedInPost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      text,
      visibility,
    }: {
      text: string;
      visibility?: string;
    }) => invoke<string>("linkedin_create_post", { text, visibility }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["linkedin", "posts"] });
    },
  });
}

export function useDeleteLinkedInPost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (postId: string) =>
      invoke<void>("linkedin_delete_post", { postId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["linkedin", "posts"] });
    },
  });
}
