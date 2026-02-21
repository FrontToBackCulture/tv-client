// Portal Changelog CRUD hooks

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type { ChangelogEntry } from "../../lib/portal/types";
import { portalKeys } from "./keys";

export function useChangelog() {
  return useQuery({
    queryKey: portalKeys.changelog(),
    queryFn: async (): Promise<ChangelogEntry[]> => {
      const { data, error } = await supabase
        .from("portal_changelog")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw new Error(`Failed to fetch changelog: ${error.message}`);
      return (data ?? []) as ChangelogEntry[];
    },
  });
}

export function useCreateChangelog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (entry: Partial<ChangelogEntry>): Promise<ChangelogEntry> => {
      const isPublished = entry.is_published ?? false;
      const { data, error } = await supabase
        .from("portal_changelog")
        .insert({
          ...entry,
          is_published: isPublished,
          published_at: isPublished ? new Date().toISOString() : null,
        })
        .select()
        .single();
      if (error) throw new Error(`Failed to create changelog entry: ${error.message}`);
      return data as ChangelogEntry;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalKeys.changelog() });
    },
  });
}

export function useUpdateChangelog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<ChangelogEntry> & { id: string }): Promise<ChangelogEntry> => {
      const payload: Record<string, unknown> = {
        ...updates,
        updated_at: new Date().toISOString(),
      };
      // Set published_at on first publish
      if (updates.is_published === true) {
        const { data: existing } = await supabase
          .from("portal_changelog")
          .select("published_at")
          .eq("id", id)
          .single();
        if (existing && !existing.published_at) {
          payload.published_at = new Date().toISOString();
        }
      }
      const { data, error } = await supabase
        .from("portal_changelog")
        .update(payload)
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(`Failed to update changelog entry: ${error.message}`);
      return data as ChangelogEntry;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalKeys.changelog() });
    },
  });
}

export function useDeleteChangelog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from("portal_changelog")
        .delete()
        .eq("id", id);
      if (error) throw new Error(`Failed to delete changelog entry: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalKeys.changelog() });
    },
  });
}
