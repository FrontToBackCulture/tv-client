// src/hooks/documentation/useDocs.ts

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { documentationKeys } from "./keys";
import type { DocsPage, DocsSection } from "../../lib/documentation/types";

export function useDocsSections() {
  return useQuery({
    queryKey: documentationKeys.sections(),
    queryFn: async (): Promise<DocsSection[]> => {
      const { data, error } = await supabase
        .from("docs_sections")
        .select("id, slug, title, description, icon, sort_order")
        .eq("visible", true)
        .order("sort_order");
      if (error) throw new Error(`Failed to fetch docs sections: ${error.message}`);
      return data ?? [];
    },
  });
}

export function useDocsPagesBySection(sectionId: string | null) {
  return useQuery({
    queryKey: documentationKeys.pagesBySection(sectionId ?? ""),
    queryFn: async (): Promise<DocsPage[]> => {
      if (!sectionId) return [];
      const { data, error } = await supabase
        .from("docs_pages")
        .select("id, section_id, slug, title, summary, body_md, tags, sort_order, updated_at")
        .eq("section_id", sectionId)
        .eq("visible", true)
        .order("sort_order")
        .order("title");
      if (error) throw new Error(`Failed to fetch docs pages: ${error.message}`);
      return data ?? [];
    },
    enabled: !!sectionId,
  });
}

export function useDocsPage(sectionSlug: string | null, pageSlug: string | null) {
  return useQuery({
    queryKey: documentationKeys.page(sectionSlug ?? "", pageSlug ?? ""),
    queryFn: async (): Promise<{ section: DocsSection; page: DocsPage } | null> => {
      if (!sectionSlug || !pageSlug) return null;
      const { data: section, error: sErr } = await supabase
        .from("docs_sections")
        .select("id, slug, title, description, icon, sort_order")
        .eq("slug", sectionSlug)
        .eq("visible", true)
        .maybeSingle();
      if (sErr) throw new Error(`Failed to fetch section: ${sErr.message}`);
      if (!section) return null;

      const { data: page, error: pErr } = await supabase
        .from("docs_pages")
        .select("id, section_id, slug, title, summary, body_md, tags, sort_order, updated_at")
        .eq("section_id", section.id)
        .eq("slug", pageSlug)
        .eq("visible", true)
        .maybeSingle();
      if (pErr) throw new Error(`Failed to fetch page: ${pErr.message}`);
      if (!page) return null;

      return { section, page };
    },
    enabled: !!(sectionSlug && pageSlug),
  });
}
