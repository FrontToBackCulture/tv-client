// VAL Drive → Portal exposure (file- and folder-level)
// Drive files/folders are exposed to the client portal like artifact reviews:
// edit Portal/Sitemap fields in the per-domain Drive review grid, then
// "Sync to Portal" reconciles into portal_resources. A file row syncs as
// resource_type='drive_file' (card deep-links into VAL's Drive viewer,
// renderMode=content); a folder row syncs as resource_type='drive_folder'
// (card deep-links into VAL's /valdrive/?folder= listing). The portal client
// is VAL-authed, so both open directly — no proxy needed.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type { ReviewRow } from "../../modules/domains/reviewTypes";

/** Which portal_resources flavour a Drive review row syncs as. */
export type DriveResourceKind = "drive_file" | "drive_folder";

export interface DrivePortalResource {
  resource_id: string; // full VAL Drive file/folder path == resource_id
  name: string;
  description: string | null;
  sitemap_group1: string; // portal tab
  sitemap_group2: string; // portal section
  solution: string | null;
  resource_url: string | null;
}

/** Back-compat alias — `DrivePortalResource` covers both files and folders. */
export type DrivePortalFile = DrivePortalResource;

const drivePortalKey = (domain: string, kind: DriveResourceKind) =>
  ["val-drive", "portal-resources", kind, domain] as const;

/**
 * Deep-link into VAL's web Drive viewer for a file. The client is VAL-authed,
 * so this opens directly — no proxy. `folder` is the path relative to
 * val_drive (the val_drive/ prefix stripped); slashes kept, segments encoded.
 * Pattern: https://{domain}.thinkval.io/valdrive/?folder={folder}&filename={file}&renderMode=content
 */
export function buildDriveFileUrl(domain: string, filePath: string): string {
  const rel = filePath.replace(/^val_drive\/?/, "");
  const slash = rel.lastIndexOf("/");
  const folder = slash >= 0 ? rel.slice(0, slash) : "";
  const filename = slash >= 0 ? rel.slice(slash + 1) : rel;
  const encFolder = folder
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  return `https://${domain}.thinkval.io/valdrive/?folder=${encFolder}&filename=${encodeURIComponent(
    filename
  )}&renderMode=content`;
}

/**
 * Deep-link into VAL's web Drive folder listing. Same `/valdrive/` route as
 * files (confirmed with the user — VAL's frontend lives outside SkyNet), with
 * `folder` only and no `filename`/`renderMode`:
 *   https://{domain}.thinkval.io/valdrive/?folder={folderRelToValDrive}
 * `folder` is the path relative to val_drive (the `val_drive/` prefix
 * stripped); slashes kept, segments encoded — identical handling to
 * buildDriveFileUrl. The client is VAL-authed, so this opens directly.
 */
export function buildDriveFolderUrl(domain: string, folderPath: string): string {
  const rel = folderPath.replace(/^val_drive\/?/, "").replace(/\/+$/, "");
  const encFolder = rel
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  return `https://${domain}.thinkval.io/valdrive/?folder=${encFolder}`;
}

function buildResourceUrl(
  domain: string,
  kind: DriveResourceKind,
  path: string
): string {
  return kind === "drive_folder"
    ? buildDriveFolderUrl(domain, path)
    : buildDriveFileUrl(domain, path);
}

/**
 * Drive files OR folders currently exposed to the portal for a domain (for
 * grid prefill). Scoped to a single resource_type so the Files and Folders
 * modes prefill independently.
 */
export function useValDrivePortalResources(
  domain: string | null,
  kind: DriveResourceKind
) {
  return useQuery({
    queryKey: drivePortalKey(domain ?? "", kind),
    queryFn: async (): Promise<DrivePortalResource[]> => {
      const { data, error } = await supabase
        .from("portal_resources")
        .select(
          "resource_id, name, description, sitemap_group1, sitemap_group2, solution, resource_url"
        )
        .eq("domain", domain)
        .eq("resource_type", kind);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!domain,
    staleTime: 30_000,
  });
}

/** Back-compat alias — files only. */
export function useValDrivePortalFiles(domain: string | null) {
  return useValDrivePortalResources(domain, "drive_file");
}

export interface DrivePortalSyncResult {
  synced: number;
  removed: number;
}

/**
 * Reconcile a domain's drive_file OR drive_folder rows in portal_resources
 * from the review grid: upsert every row flagged includeSitemap (with a tab),
 * delete any previously-exposed row of the SAME kind no longer flagged. Scoped
 * to one resource_type so file rows, folder rows, and artifact rows never
 * touch each other. Mirrors UnifiedReviewView.handleSyncToPortal.
 */
export function useSyncDriveResourcesToPortal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      domain: string;
      kind: DriveResourceKind;
      rows: ReviewRow[];
    }): Promise<DrivePortalSyncResult> => {
      const { domain, kind, rows } = input;

      const resourcesToInclude = rows
        .filter((r) => r.includeSitemap && r.sitemapGroup1)
        .map((r) => {
          // folderName carries the full VAL Drive path (== resource_id)
          const path = r.folderName;
          return {
            domain,
            resource_id: path,
            name: r.displayName || r.name,
            description: r.summaryShort || r.description || null,
            resource_type: kind,
            resource_url: buildResourceUrl(domain, kind, path),
            sitemap_group1: r.sitemapGroup1 as string,
            sitemap_group2: r.sitemapGroup2 || r.sitemapGroup1,
            solution: r.solution || null,
            include_sitemap: true,
          };
        });

      const { data: existing, error: fetchErr } = await supabase
        .from("portal_resources")
        .select("resource_id")
        .eq("domain", domain)
        .eq("resource_type", kind);
      if (fetchErr) throw new Error(fetchErr.message);

      const includedIds = new Set(resourcesToInclude.map((r) => r.resource_id));
      const toDelete = (existing || [])
        .map((e: { resource_id: string }) => e.resource_id)
        .filter((id: string) => !includedIds.has(id));

      if (resourcesToInclude.length > 0) {
        const { error: upsertErr } = await supabase
          .from("portal_resources")
          .upsert(resourcesToInclude, { onConflict: "domain,resource_id" });
        if (upsertErr) throw new Error(upsertErr.message);
      }

      if (toDelete.length > 0) {
        const { error: delErr } = await supabase
          .from("portal_resources")
          .delete()
          .eq("domain", domain)
          .eq("resource_type", kind)
          .in("resource_id", toDelete);
        if (delErr) throw new Error(delErr.message);
      }

      return { synced: resourcesToInclude.length, removed: toDelete.length };
    },
    onSuccess: (_data, v) =>
      queryClient.invalidateQueries({
        queryKey: drivePortalKey(v.domain, v.kind),
      }),
  });
}

/** Back-compat alias — file sync. Pass `kind:'drive_file'` in the input. */
export const useSyncDriveFilesToPortal = useSyncDriveResourcesToPortal;
