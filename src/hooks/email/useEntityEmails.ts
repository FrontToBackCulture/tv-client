// Hooks for email ↔ entity linking (projects, tasks, companies, contacts)

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "../../lib/supabase";

// Types
export interface EmailEntityLink {
  id: string;
  email_type: "correspondence" | "campaign";
  email_id: string;
  entity_type: "project" | "task" | "company" | "contact";
  entity_id: string;
  match_method: string | null;
  relevance_score: number | null;
  created_at: string;
}

export interface LinkedEmail extends EmailEntityLink {
  subject: string | null;
  from_email: string;
  from_name: string | null;
  received_at: string | null;
}

export interface ScanCandidate {
  email_id: string;
  email_type: "correspondence" | "campaign";
  subject: string;
  from_email: string;
  from_name: string;
  received_at: string;
  folder_name?: string;
  match_method: string;
  relevance_score: number;
  already_linked: boolean;
}

// Tauri returns camelCase, normalize to snake_case
interface TauriScanResult {
  emailId: string;
  subject: string;
  fromEmail: string;
  fromName: string;
  receivedAt: string;
  folderName: string;
  matchMethod: string;
  relevanceScore: number;
}

// Query keys
export const entityEmailKeys = {
  all: ["entity-emails"] as const,
  linked: (entityType: string, entityId: string) =>
    [...entityEmailKeys.all, "linked", entityType, entityId] as const,
  count: (entityType: string, entityId: string) =>
    [...entityEmailKeys.all, "count", entityType, entityId] as const,
  scan: (entityType: string, entityId: string) =>
    [...entityEmailKeys.all, "scan", entityType, entityId] as const,
};

/** Fetch linked emails for an entity */
export function useLinkedEmails(entityType: string, entityId: string) {
  return useQuery({
    queryKey: entityEmailKeys.linked(entityType, entityId),
    queryFn: async (): Promise<LinkedEmail[]> => {
      // Get links
      const { data: links, error: linkError } = await supabase
        .from("email_entity_links")
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false });

      if (linkError) throw new Error(linkError.message);
      if (!links?.length) return [];

      const correspondenceIds = links
        .filter((l) => l.email_type === "correspondence")
        .map((l) => l.email_id);
      const campaignIds = links
        .filter((l) => l.email_type === "campaign")
        .map((l) => l.email_id);

      const results: LinkedEmail[] = [];

      // Correspondence: try Supabase email_cache first, then fall back to local SQLite
      if (correspondenceIds.length) {
        // 1. Check shared cache in Supabase
        const { data: cached } = await supabase
          .from("email_cache")
          .select("id, subject, from_email, from_name, received_at")
          .in("id", correspondenceIds);

        const cacheMap = new Map(
          (cached || []).map((c) => [c.id, c])
        );

        // 2. Find IDs not in cache — try local SQLite for those
        const uncachedIds = correspondenceIds.filter((id) => !cacheMap.has(id));
        const localMap = new Map<string, { id: string; subject: string; fromEmail: string; fromName: string; receivedAt: string }>();

        if (uncachedIds.length > 0) {
          try {
            const emails = await Promise.all(
              uncachedIds.map((id) =>
                invoke<{ id: string; subject: string; fromEmail: string; fromName: string; receivedAt: string } | null>(
                  "outlook_get_email",
                  { id }
                )
              )
            );
            for (const e of emails) {
              if (e) localMap.set(e.id, e);
            }
          } catch {
            // SQLite not available — skip
          }
        }

        // 3. Merge: prefer cache, fall back to local
        for (const link of links.filter((l) => l.email_type === "correspondence")) {
          const cached = cacheMap.get(link.email_id);
          const local = localMap.get(link.email_id);
          if (cached) {
            results.push({
              ...link,
              subject: cached.subject,
              from_email: cached.from_email,
              from_name: cached.from_name,
              received_at: cached.received_at,
            });
          } else if (local) {
            results.push({
              ...link,
              subject: local.subject,
              from_email: local.fromEmail,
              from_name: local.fromName,
              received_at: local.receivedAt,
            });
          }
        }
      }

      // Campaigns: fetch from Supabase
      if (campaignIds.length) {
        const { data: campaigns } = await supabase
          .from("email_campaigns")
          .select("id, subject, from_email, from_name, sent_at")
          .in("id", campaignIds);

        const campMap = new Map(campaigns?.map((c) => [c.id, c]) || []);
        for (const link of links.filter((l) => l.email_type === "campaign")) {
          const camp = campMap.get(link.email_id);
          if (camp) {
            results.push({
              ...link,
              subject: camp.subject,
              from_email: camp.from_email,
              from_name: camp.from_name,
              received_at: camp.sent_at,
            });
          }
        }
      }

      return results.sort(
        (a, b) =>
          new Date(b.received_at || 0).getTime() -
          new Date(a.received_at || 0).getTime()
      );
    },
    enabled: !!entityType && !!entityId,
  });
}

/** Fetch rolled-up emails from all projects under an initiative */
export function useInitiativeEmails(initiativeId: string | null, projectIds: string[]) {
  return useQuery({
    queryKey: [...entityEmailKeys.all, "initiative", initiativeId],
    queryFn: async (): Promise<LinkedEmail[]> => {
      if (!projectIds.length) return [];

      // Fetch all email links for all projects in one query
      const { data: links, error } = await supabase
        .from("email_entity_links")
        .select("*")
        .eq("entity_type", "project")
        .in("entity_id", projectIds)
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);
      if (!links?.length) return [];

      // Deduplicate by email_id (same email may be linked to multiple projects)
      const seen = new Set<string>();
      const uniqueLinks = links.filter(l => {
        if (seen.has(l.email_id)) return false;
        seen.add(l.email_id);
        return true;
      });

      const correspondenceIds = uniqueLinks.filter(l => l.email_type === "correspondence").map(l => l.email_id);
      const campaignIds = uniqueLinks.filter(l => l.email_type === "campaign").map(l => l.email_id);

      const results: LinkedEmail[] = [];

      // Correspondence: try Supabase email_cache first, fall back to local SQLite
      if (correspondenceIds.length) {
        const { data: cached } = await supabase
          .from("email_cache")
          .select("id, subject, from_email, from_name, received_at")
          .in("id", correspondenceIds);

        const cacheMap = new Map((cached || []).map(c => [c.id, c]));
        const uncachedIds = correspondenceIds.filter(id => !cacheMap.has(id));
        const localMap = new Map<string, { id: string; subject: string; fromEmail: string; fromName: string; receivedAt: string }>();

        if (uncachedIds.length > 0) {
          try {
            const emails = await Promise.all(
              uncachedIds.map(id =>
                invoke<{ id: string; subject: string; fromEmail: string; fromName: string; receivedAt: string } | null>(
                  "outlook_get_email", { id }
                )
              )
            );
            for (const e of emails) { if (e) localMap.set(e.id, e); }
          } catch { /* SQLite not available */ }
        }

        for (const link of uniqueLinks.filter(l => l.email_type === "correspondence")) {
          const c = cacheMap.get(link.email_id);
          const l = localMap.get(link.email_id);
          if (c) {
            results.push({ ...link, subject: c.subject, from_email: c.from_email, from_name: c.from_name, received_at: c.received_at });
          } else if (l) {
            results.push({ ...link, subject: l.subject, from_email: l.fromEmail, from_name: l.fromName, received_at: l.receivedAt });
          }
        }
      }

      // Campaigns: fetch from Supabase
      if (campaignIds.length) {
        const { data: campaigns } = await supabase
          .from("email_campaigns")
          .select("id, subject, from_email, from_name, sent_at")
          .in("id", campaignIds);

        const campMap = new Map(campaigns?.map(c => [c.id, c]) || []);
        for (const link of uniqueLinks.filter(l => l.email_type === "campaign")) {
          const camp = campMap.get(link.email_id);
          if (camp) {
            results.push({
              ...link,
              subject: camp.subject,
              from_email: camp.from_email,
              from_name: camp.from_name,
              received_at: camp.sent_at,
            });
          }
        }
      }

      return results.sort((a, b) =>
        new Date(b.received_at || 0).getTime() - new Date(a.received_at || 0).getTime()
      );
    },
    enabled: !!initiativeId && projectIds.length > 0,
  });
}

/** Count linked emails (lightweight, for badges) */
export function useLinkedEmailCount(entityType: string, entityId: string) {
  return useQuery({
    queryKey: entityEmailKeys.count(entityType, entityId),
    queryFn: async () => {
      const { count, error } = await supabase
        .from("email_entity_links")
        .select("id", { count: "exact", head: true })
        .eq("entity_type", entityType)
        .eq("entity_id", entityId);

      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    enabled: !!entityType && !!entityId,
  });
}

/** Scan for email candidates via local SQLite (Tauri command) */
export function useScanEmails(entityType: string, entityId: string) {
  return useQuery({
    queryKey: entityEmailKeys.scan(entityType, entityId),
    queryFn: async (): Promise<ScanCandidate[]> => {
      // 1. Resolve company_id from entity
      let companyId: string | null = null;
      if (entityType === "project" || entityType === "company") {
        if (entityType === "company") {
          companyId = entityId;
        } else {
          const { data: project } = await supabase
            .from("projects")
            .select("company_id")
            .eq("id", entityId)
            .single();
          companyId = project?.company_id || null;
        }
      } else if (entityType === "task") {
        const { data: task } = await supabase
          .from("tasks")
          .select("company_id, project_id")
          .eq("id", entityId)
          .single();
        companyId = task?.company_id || null;
        if (!companyId && task?.project_id) {
          const { data: project } = await supabase
            .from("projects")
            .select("company_id")
            .eq("id", task.project_id)
            .single();
          companyId = project?.company_id || null;
        }
      }

      if (!companyId) return [];

      // 2. Get company email_domains and contact emails
      const { data: company } = await supabase
        .from("crm_companies")
        .select("email_domains")
        .eq("id", companyId)
        .single();

      const { data: contacts } = await supabase
        .from("crm_contacts")
        .select("email")
        .eq("company_id", companyId);

      const domains: string[] = company?.email_domains || [];
      const contactEmails: string[] = (contacts || [])
        .map((c: { email: string }) => c.email?.toLowerCase())
        .filter(Boolean);

      console.log("[email-scan] companyId:", companyId, "domains:", domains, "contacts:", contactEmails);
      if (domains.length === 0 && contactEmails.length === 0) return [];

      // 3. Call Tauri command to scan local SQLite
      let raw: TauriScanResult[];
      try {
        raw = await invoke<TauriScanResult[]>("outlook_scan_emails", {
          domains,
          contactEmails,
        });
        console.log("[email-scan] Tauri returned", raw.length, "results", raw.slice(0, 3));
      } catch (err) {
        console.error("[email-scan] Tauri invoke failed:", err);
        return [];
      }

      // 4. Check which are already linked
      const { data: existingLinks } = await supabase
        .from("email_entity_links")
        .select("email_id")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId);
      const linkedIds = new Set((existingLinks || []).map((l: { email_id: string }) => l.email_id));

      return raw.map((r) => ({
        email_id: r.emailId,
        email_type: "correspondence" as const,
        subject: r.subject,
        from_email: r.fromEmail,
        from_name: r.fromName,
        received_at: r.receivedAt,
        folder_name: r.folderName,
        match_method: r.matchMethod,
        relevance_score: r.relevanceScore,
        already_linked: linkedIds.has(r.emailId),
      }));
    },
    enabled: false, // Only run when explicitly triggered
  });
}

/** Link emails to an entity — also caches correspondence metadata to Supabase for team visibility */
export function useLinkEmails() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      emails,
      entityType,
      entityId,
    }: {
      emails: Pick<ScanCandidate, "email_id" | "email_type" | "match_method" | "relevance_score" | "subject" | "from_email" | "from_name" | "received_at">[];
      entityType: string;
      entityId: string;
    }) => {
      const rows = emails.map((e) => ({
        email_type: e.email_type,
        email_id: e.email_id,
        entity_type: entityType,
        entity_id: entityId,
        match_method: e.match_method,
        relevance_score: e.relevance_score,
      }));

      const { error } = await supabase
        .from("email_entity_links")
        .upsert(rows, {
          onConflict: "email_type,email_id,entity_type,entity_id",
          ignoreDuplicates: true,
        });

      if (error) throw new Error(error.message);

      // Cache correspondence email metadata to Supabase (so teammates can see it)
      const correspondenceEmails = emails.filter(e => e.email_type === "correspondence");
      if (correspondenceEmails.length > 0) {
        // Fetch body previews from local SQLite
        const cacheRows = await Promise.all(
          correspondenceEmails.map(async (e) => {
            let bodyPreview: string | null = null;
            try {
              const detail = await invoke<{ body?: string } | null>("outlook_get_email", { id: e.email_id });
              if (detail?.body) {
                // Strip HTML tags and take first 500 chars
                bodyPreview = detail.body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
              }
            } catch { /* local SQLite not available */ }

            return {
              id: e.email_id,
              subject: e.subject || null,
              from_email: e.from_email,
              from_name: e.from_name || null,
              received_at: e.received_at || null,
              body_preview: bodyPreview,
            };
          })
        );

        // Upsert to email_cache (ignore conflicts — don't overwrite existing cache)
        await supabase
          .from("email_cache")
          .upsert(cacheRows, { onConflict: "id", ignoreDuplicates: true });
      }
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({
        queryKey: entityEmailKeys.linked(vars.entityType, vars.entityId),
      });
      queryClient.invalidateQueries({
        queryKey: entityEmailKeys.count(vars.entityType, vars.entityId),
      });
    },
  });
}

/** Unlink an email from an entity */
export function useUnlinkEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await supabase
        .from("email_entity_links")
        .delete()
        .eq("id", linkId);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: entityEmailKeys.all });
    },
  });
}
