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
