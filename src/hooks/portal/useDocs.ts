// Portal Docs (Help Center) CRUD hooks

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type { PortalDoc } from "../../lib/portal/types";
import { portalKeys } from "./keys";

export function usePortalDocs() {
  return useQuery({
    queryKey: portalKeys.docs(),
    queryFn: async (): Promise<PortalDoc[]> => {
      const { data, error } = await supabase
        .from("portal_docs")
        .select("*")
        .order("sort_order")
        .order("created_at", { ascending: false });
      if (error) throw new Error(`Failed to fetch docs: ${error.message}`);
      return (data ?? []) as PortalDoc[];
    },
  });
}

export function useCreateDoc() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (doc: Partial<PortalDoc>): Promise<PortalDoc> => {
      const { data, error } = await supabase
        .from("portal_docs")
        .insert({
          title: doc.title || "Untitled",
          summary: doc.summary || null,
          content: doc.content || "",
          category: doc.category || null,
          doc_type: doc.doc_type || "article",
          tags: doc.tags || [],
          is_widget_visible: doc.is_widget_visible ?? false,
          sort_order: doc.sort_order ?? 0,
          target_sites: doc.target_sites || [],
        })
        .select()
        .single();
      if (error) throw new Error(`Failed to create doc: ${error.message}`);
      return data as PortalDoc;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalKeys.docs() });
    },
  });
}

export function useUpdateDoc() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<PortalDoc> & { id: string }): Promise<PortalDoc> => {
      const { data, error } = await supabase
        .from("portal_docs")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(`Failed to update doc: ${error.message}`);
      return data as PortalDoc;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalKeys.docs() });
    },
  });
}

export function useDeleteDoc() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from("portal_docs")
        .delete()
        .eq("id", id);
      if (error) throw new Error(`Failed to delete doc: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalKeys.docs() });
    },
  });
}
