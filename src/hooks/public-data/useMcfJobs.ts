import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { publicDataKeys } from "./keys";
import type { McfJobPosting, JobFilters } from "../../lib/public-data/types";

const PAGE_SIZE = 50;

// Columns to select — skip heavy fields like description and raw_json for the list view
const LIST_COLUMNS = [
  "id", "mcf_uuid", "title", "company_name", "company_uen", "company_ssic_code",
  "company_employee_count", "company_url", "company_logo",
  "salary_min", "salary_max", "salary_type",
  "employment_types", "position_levels", "categories",
  "minimum_years_experience", "number_of_vacancies",
  "job_status", "new_posting_date", "expiry_date", "job_details_url",
  "ssoc_code", "industry_tag", "acra_ssic_code", "acra_ssic_description",
  "role_category",
].join(",");

export function useMcfJobs(filters: JobFilters) {
  return useInfiniteQuery({
    queryKey: publicDataKeys.mcfJobs(filters),
    queryFn: async ({ pageParam = 0 }): Promise<McfJobPosting[]> => {
      let query = supabase
        .schema("public_data")
        .from("mcf_job_postings")
        .select(LIST_COLUMNS)
        .order("new_posting_date", { ascending: false, nullsFirst: false })
        .range(pageParam * PAGE_SIZE, (pageParam + 1) * PAGE_SIZE - 1);

      if (filters.search) {
        query = query.or(
          `title.ilike.%${filters.search}%,company_name.ilike.%${filters.search}%`
        );
      }
      if (filters.industry_tag?.length) {
        query = query.in("industry_tag", filters.industry_tag);
      }
      if (filters.salary_min) {
        query = query.gte("salary_min", filters.salary_min);
      }
      if (filters.company_employee_count?.length) {
        query = query.in("company_employee_count", filters.company_employee_count);
      }
      if (filters.role_category?.length) {
        query = query.in("role_category", filters.role_category);
      }

      const { data, error } = await query;
      if (error) throw new Error(`Failed to fetch jobs: ${error.message}`);
      return (data ?? []) as unknown as McfJobPosting[];
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === PAGE_SIZE ? allPages.length : undefined,
    initialPageParam: 0,
  });
}

// ─── CSV Export ────────────────────────────────────────
//
// Fetches every row matching `filters` (paged server-side at 1000/page) and
// triggers a browser CSV download. Bypasses the grid's progressive 50-row
// reveal so users get the full result set, not just what's been scrolled into.
//
// Includes more columns than the list view (description, URL, UEN, SSOC) so
// the export is useful for downstream prospecting work.

const EXPORT_PAGE = 1000;

const EXPORT_COLUMNS = [
  "title", "company_name", "company_uen", "company_ssic_code",
  "acra_ssic_code", "acra_ssic_description",
  "industry_tag", "role_category", "ssoc_code",
  "salary_min", "salary_max", "salary_type",
  "company_employee_count", "minimum_years_experience", "number_of_vacancies",
  "employment_types", "position_levels",
  "new_posting_date", "expiry_date", "job_status",
  "address_postal_code", "job_details_url", "description",
] as const;

type ExportRow = Record<(typeof EXPORT_COLUMNS)[number], unknown>;

function csvEscape(val: unknown): string {
  if (val == null) return "";
  let s: string;
  if (Array.isArray(val)) s = val.join("; ");
  else if (typeof val === "object") s = JSON.stringify(val);
  else s = String(val);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function exportMcfJobsCsv(
  filters: JobFilters,
  onProgress?: (loaded: number) => void
): Promise<{ rows: number; filename: string }> {
  const all: ExportRow[] = [];
  let page = 0;

  while (true) {
    let query = supabase
      .schema("public_data")
      .from("mcf_job_postings")
      .select(EXPORT_COLUMNS.join(","))
      .order("new_posting_date", { ascending: false, nullsFirst: false })
      .range(page * EXPORT_PAGE, (page + 1) * EXPORT_PAGE - 1);

    if (filters.search) {
      query = query.or(
        `title.ilike.%${filters.search}%,company_name.ilike.%${filters.search}%`
      );
    }
    if (filters.industry_tag?.length) query = query.in("industry_tag", filters.industry_tag);
    if (filters.salary_min) query = query.gte("salary_min", filters.salary_min);
    if (filters.company_employee_count?.length) {
      query = query.in("company_employee_count", filters.company_employee_count);
    }
    if (filters.role_category?.length) query = query.in("role_category", filters.role_category);

    const { data, error } = await query;
    if (error) throw new Error(`Export failed: ${error.message}`);

    const batch = (data ?? []) as unknown as ExportRow[];
    all.push(...batch);
    onProgress?.(all.length);

    if (batch.length < EXPORT_PAGE) break;
    page++;
  }

  const header = EXPORT_COLUMNS.join(",");
  const body = all.map((r) => EXPORT_COLUMNS.map((c) => csvEscape(r[c])).join(",")).join("\n");
  const csv = `${header}\n${body}`;

  const stamp = new Date().toISOString().slice(0, 10);
  const parts = ["mcf-jobs", filters.industry_tag?.[0], filters.role_category?.[0], stamp].filter(Boolean);
  const filename = `${parts.join("-")}.csv`;

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return { rows: all.length, filename };
}

// Full job detail (includes description)
export function useMcfJob(mcfUuid: string | null) {
  return useQuery({
    queryKey: [...publicDataKeys.mcfJobs({}), "detail", mcfUuid],
    queryFn: async (): Promise<McfJobPosting | null> => {
      if (!mcfUuid) return null;
      const { data, error } = await supabase
        .schema("public_data")
        .from("mcf_job_postings")
        .select("*")
        .eq("mcf_uuid", mcfUuid)
        .single();
      if (error) throw new Error(`Failed to fetch job: ${error.message}`);
      return data as McfJobPosting;
    },
    enabled: !!mcfUuid,
  });
}
