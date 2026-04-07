import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type {
  SolutionInstance,
  SolutionInstanceWithTemplate,
  InstanceData,
} from "../../lib/solutions/types";
import { solutionKeys } from "./keys";

export function useSolutionInstancesByDomain(domain: string | null) {
  return useQuery({
    queryKey: solutionKeys.instancesByDomain(domain || ""),
    queryFn: async (): Promise<SolutionInstanceWithTemplate[]> => {
      if (!domain) return [];
      const { data, error } = await supabase
        .from("solution_instances")
        .select("*, template:solution_templates(*)")
        .eq("domain", domain)
        .order("created_at", { ascending: true });
      if (error)
        throw new Error(`Failed to fetch instances: ${error.message}`);
      return (data ?? []) as unknown as SolutionInstanceWithTemplate[];
    },
    enabled: !!domain,
  });
}

export function useSolutionInstance(id: string | null) {
  return useQuery({
    queryKey: solutionKeys.instance(id || ""),
    queryFn: async (): Promise<SolutionInstanceWithTemplate | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("solution_instances")
        .select("*, template:solution_templates(*)")
        .eq("id", id)
        .single();
      if (error?.code === "PGRST116") return null;
      if (error) throw new Error(`Failed to fetch instance: ${error.message}`);
      return data as unknown as SolutionInstanceWithTemplate;
    },
    enabled: !!id,
  });
}

export function useCreateSolutionInstance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      domain,
      templateId,
      templateVersion,
    }: {
      domain: string;
      templateId: string;
      templateVersion: number;
    }): Promise<SolutionInstance> => {
      const { data, error } = await supabase
        .from("solution_instances")
        .insert({
          domain,
          template_id: templateId,
          template_version: templateVersion,
          data: {},
          status: "active",
          started_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error)
        throw new Error(`Failed to create instance: ${error.message}`);
      return data as SolutionInstance;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: solutionKeys.instancesByDomain(variables.domain),
      });
    },
  });
}

export function useUpdateSolutionInstanceData() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
      totalItems,
      completedItems,
      progressPct,
    }: {
      id: string;
      data: InstanceData;
      totalItems: number;
      completedItems: number;
      progressPct: number;
    }): Promise<SolutionInstance> => {
      const { data: result, error } = await supabase
        .from("solution_instances")
        .update({
          data,
          total_items: totalItems,
          completed_items: completedItems,
          progress_pct: progressPct,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(`Failed to update instance: ${error.message}`);
      return result as SolutionInstance;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: solutionKeys.instance(result.id),
      });
      queryClient.invalidateQueries({
        queryKey: solutionKeys.instancesByDomain(result.domain),
      });
    },
  });
}

export function useAlignSolutionInstanceVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      templateVersion,
    }: {
      id: string;
      templateVersion: number;
    }): Promise<SolutionInstance> => {
      const { data: result, error } = await supabase
        .from("solution_instances")
        .update({
          template_version: templateVersion,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(`Failed to align version: ${error.message}`);
      return result as SolutionInstance;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: solutionKeys.instance(result.id),
      });
      queryClient.invalidateQueries({
        queryKey: solutionKeys.instancesByDomain(result.domain),
      });
    },
  });
}

export function useDeleteSolutionInstance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      domain: _domain,
    }: {
      id: string;
      domain: string;
    }): Promise<void> => {
      const { error } = await supabase
        .from("solution_instances")
        .delete()
        .eq("id", id);
      if (error) throw new Error(`Failed to delete instance: ${error.message}`);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: solutionKeys.instancesByDomain(variables.domain),
      });
    },
  });
}
