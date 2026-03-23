import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type { BlogArticle } from "./types";

const blogKeys = {
  all: ["blog-articles"] as const,
  detail: (id: string) => ["blog-article", id] as const,
};

export function useBlogArticles() {
  return useQuery({
    queryKey: blogKeys.all,
    queryFn: async (): Promise<BlogArticle[]> => {
      const { data, error } = await supabase
        .from("blog_articles")
        .select("*")
        .order("published_at", { ascending: false, nullsFirst: false });

      if (error) throw new Error(error.message);
      return data as BlogArticle[];
    },
    staleTime: 30_000,
  });
}

export function useBlogArticle(id: string | null) {
  return useQuery({
    queryKey: blogKeys.detail(id ?? ""),
    queryFn: async (): Promise<BlogArticle> => {
      const { data, error } = await supabase
        .from("blog_articles")
        .select("*")
        .eq("id", id!)
        .single();

      if (error) throw new Error(error.message);
      return data as BlogArticle;
    },
    enabled: !!id,
  });
}

export function useCreateArticle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (article: Partial<BlogArticle> & { slug: string; title: string }) => {
      const { data, error } = await supabase
        .from("blog_articles")
        .insert(article)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data as BlogArticle;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: blogKeys.all });
    },
  });
}

export function useUpdateArticle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<BlogArticle> & { id: string }) => {
      const { data, error } = await supabase
        .from("blog_articles")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data as BlogArticle;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: blogKeys.all });
      queryClient.invalidateQueries({ queryKey: blogKeys.detail(data.id) });
    },
  });
}

export function useDeleteArticle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("blog_articles")
        .delete()
        .eq("id", id);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: blogKeys.all });
    },
  });
}
