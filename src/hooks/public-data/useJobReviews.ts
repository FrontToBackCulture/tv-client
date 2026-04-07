import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { publicDataKeys } from "./keys";
import type { JobReview } from "../../lib/public-data/types";

export function useJobReviews(mcfUuid?: string) {
  return useQuery({
    queryKey: publicDataKeys.jobReviews(mcfUuid),
    queryFn: async (): Promise<JobReview[]> => {
      let query = supabase
        .schema("public_data")
        .from("job_reviews")
        .select("*");
      if (mcfUuid) query = query.eq("mcf_uuid", mcfUuid);
      const { data, error } = await query.order("reviewed_at", { ascending: false });
      if (error) throw new Error(`Failed to fetch reviews: ${error.message}`);
      return (data ?? []) as JobReview[];
    },
  });
}

// Returns a Set of mcf_uuids that have been reviewed by this user
export function useReviewedJobIds(reviewedBy: string) {
  return useQuery({
    queryKey: [...publicDataKeys.jobReviews(), "ids", reviewedBy],
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .schema("public_data")
        .from("job_reviews")
        .select("mcf_uuid")
        .eq("reviewed_by", reviewedBy);
      if (error) throw new Error(`Failed to fetch review IDs: ${error.message}`);
      return new Set((data ?? []).map((r) => r.mcf_uuid));
    },
    enabled: !!reviewedBy,
  });
}

export function useUpsertJobReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      review: Omit<JobReview, "id" | "created_at" | "updated_at">
    ): Promise<JobReview> => {
      const { data, error } = await supabase
        .schema("public_data")
        .from("job_reviews")
        .upsert(
          { ...review, updated_at: new Date().toISOString() },
          { onConflict: "mcf_uuid,reviewed_by" }
        )
        .select()
        .single();
      if (error) throw new Error(`Failed to save review: ${error.message}`);
      return data as JobReview;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: publicDataKeys.jobReviews(data.mcf_uuid) });
      queryClient.invalidateQueries({ queryKey: publicDataKeys.jobReviews() });
    },
  });
}
