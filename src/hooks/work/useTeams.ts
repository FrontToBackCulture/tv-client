// Teams hook — fetches teams and team membership

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { workKeys } from "./keys";
import type { Database } from "../../lib/supabase-types";

export type Team = Database["public"]["Tables"]["teams"]["Row"];
export type TeamMember = Database["public"]["Tables"]["team_members"]["Row"];

export interface TeamWithMembers extends Team {
  members: { user_id: string }[];
}

export function useTeams() {
  return useQuery({
    queryKey: workKeys.teams(),
    queryFn: async (): Promise<TeamWithMembers[]> => {
      const { data, error } = await supabase
        .from("teams")
        .select("*, members:team_members(user_id)")
        .order("name");
      if (error) throw new Error(`Failed to fetch teams: ${error.message}`);
      return (data ?? []) as TeamWithMembers[];
    },
  });
}

export function useAddTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ teamId, userId }: { teamId: string; userId: string }) => {
      const { error } = await supabase
        .from("team_members")
        .insert({ team_id: teamId, user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: workKeys.teams() }),
  });
}

export function useRemoveTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ teamId, userId }: { teamId: string; userId: string }) => {
      const { error } = await supabase
        .from("team_members")
        .delete()
        .eq("team_id", teamId)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: workKeys.teams() }),
  });
}

export function useCreateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, slug, color, description }: { name: string; slug: string; color?: string; description?: string }) => {
      const { data, error } = await supabase
        .from("teams")
        .insert({ name, slug, color: color ?? "#6B7280", description: description ?? null })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: workKeys.teams() }),
  });
}

export function useDeleteTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (teamId: string) => {
      const { error } = await supabase.from("teams").delete().eq("id", teamId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: workKeys.teams() }),
  });
}
