// Email Contact-Group membership hooks

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { emailKeys } from "./keys";

export function useAddContactToGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      contactId,
      groupId,
    }: {
      contactId: string;
      groupId: string;
    }): Promise<void> => {
      const { error } = await supabase
        .from("email_contact_groups")
        .insert({ contact_id: contactId, group_id: groupId });

      if (error)
        throw new Error(`Failed to add contact to group: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.contacts() });
      queryClient.invalidateQueries({ queryKey: emailKeys.groups() });
    },
  });
}

export function useRemoveContactFromGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      contactId,
      groupId,
    }: {
      contactId: string;
      groupId: string;
    }): Promise<void> => {
      const { error } = await supabase
        .from("email_contact_groups")
        .delete()
        .eq("contact_id", contactId)
        .eq("group_id", groupId);

      if (error)
        throw new Error(
          `Failed to remove contact from group: ${error.message}`
        );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.contacts() });
      queryClient.invalidateQueries({ queryKey: emailKeys.groups() });
    },
  });
}

export function useAddContactsToGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      contactIds,
      groupId,
    }: {
      contactIds: string[];
      groupId: string;
    }): Promise<void> => {
      const rows = contactIds.map((contactId) => ({
        contact_id: contactId,
        group_id: groupId,
      }));

      const { error } = await supabase
        .from("email_contact_groups")
        .upsert(rows, { onConflict: "contact_id,group_id" });

      if (error)
        throw new Error(`Failed to add contacts to group: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.contacts() });
      queryClient.invalidateQueries({ queryKey: emailKeys.groups() });
    },
  });
}
