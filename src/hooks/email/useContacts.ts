// Email Contacts CRUD hooks
// Now queries crm_contacts (unified contact list)

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type {
  EmailContact,
  EmailContactUpdate,
  EmailContactFilters,
  EmailContactWithGroups,
} from "../../lib/email/types";
import { emailKeys } from "./keys";

export function useEmailContacts(filters?: EmailContactFilters) {
  return useQuery({
    queryKey: filters?.groupId
      ? emailKeys.contactsByGroup(filters.groupId)
      : [...emailKeys.contacts(), filters],
    queryFn: async (): Promise<EmailContact[]> => {
      if (filters?.groupId) {
        // Fetch contacts in a specific group via join table
        const { data, error } = await supabase
          .from("email_contact_groups")
          .select("contact_id, crm_contacts(*)")
          .eq("group_id", filters.groupId);

        if (error)
          throw new Error(`Failed to fetch group contacts: ${error.message}`);
        return (data ?? []).map((row: any) => row.crm_contacts);
      }

      let query = supabase.from("crm_contacts").select("*");

      if (filters?.edmStatus) {
        if (Array.isArray(filters.edmStatus)) {
          query = query.in("edm_status", filters.edmStatus);
        } else {
          query = query.eq("edm_status", filters.edmStatus);
        }
      }

      if (filters?.search) {
        query = query.or(
          `email.ilike.%${filters.search}%,name.ilike.%${filters.search}%`
        );
      }

      const { data, error } = await query.order("created_at", {
        ascending: false,
      });

      if (error)
        throw new Error(`Failed to fetch contacts: ${error.message}`);
      return data ?? [];
    },
  });
}

export function useEmailContact(id: string | null) {
  return useQuery({
    queryKey: emailKeys.contact(id || ""),
    queryFn: async (): Promise<EmailContactWithGroups | null> => {
      if (!id) return null;

      const { data: contact, error } = await supabase
        .from("crm_contacts")
        .select("*")
        .eq("id", id)
        .single();

      if (error?.code === "PGRST116") return null;
      if (error)
        throw new Error(`Failed to fetch contact: ${error.message}`);

      // Fetch groups for this contact
      const { data: groupLinks } = await supabase
        .from("email_contact_groups")
        .select("group_id, email_groups(*)")
        .eq("contact_id", id);

      return {
        ...contact,
        groups: (groupLinks ?? []).map((link: any) => link.email_groups),
      };
    },
    enabled: !!id,
  });
}

export function useCreateEmailContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      contact: Partial<EmailContact> & { email: string; name: string }
    ): Promise<EmailContact> => {
      const { data, error } = await supabase
        .from("crm_contacts")
        .insert({
          ...contact,
          email: contact.email.toLowerCase(),
          edm_status: contact.edm_status ?? "active",
          is_active: true,
          is_primary: false,
        } as any)
        .select()
        .single();

      if (error)
        throw new Error(`Failed to create contact: ${error.message}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.contacts() });
    },
  });
}

export function useUpdateEmailContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: EmailContactUpdate;
    }): Promise<EmailContact> => {
      const updateData = { ...updates };
      if (updates.email) {
        (updateData as any).email = updates.email.toLowerCase();
      }

      const { data, error } = await supabase
        .from("crm_contacts")
        .update(updateData as any)
        .eq("id", id)
        .select()
        .single();

      if (error)
        throw new Error(`Failed to update contact: ${error.message}`);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: emailKeys.contacts() });
      queryClient.invalidateQueries({ queryKey: emailKeys.contact(data.id) });
    },
  });
}

export function useDeleteEmailContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from("crm_contacts")
        .delete()
        .eq("id", id);

      if (error)
        throw new Error(`Failed to delete contact: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.contacts() });
    },
  });
}
