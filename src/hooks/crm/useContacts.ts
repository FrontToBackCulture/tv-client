// CRM Contacts CRUD hooks

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type {
  Contact,
  ContactInsert,
  ContactUpdate,
  ContactFilters,
} from "../../lib/crm/types";
import { crmKeys } from "./keys";

export function useContacts(filters?: ContactFilters) {
  return useQuery({
    queryKey: filters?.companyId
      ? crmKeys.contactsByCompany(filters.companyId)
      : [...crmKeys.contacts(), filters],
    queryFn: async (): Promise<Contact[]> => {
      let query = supabase.from("crm_contacts").select("*");

      if (filters?.companyId) {
        query = query.eq("company_id", filters.companyId);
      }

      if (filters?.search) {
        query = query.or(
          `name.ilike.%${filters.search}%,email.ilike.%${filters.search}%`
        );
      }

      if (filters?.isActive !== undefined) {
        query = query.eq("is_active", filters.isActive);
      }

      const { data, error } = await query.order("is_primary", {
        ascending: false,
      });

      if (error) throw new Error(`Failed to fetch contacts: ${error.message}`);
      return data ?? [];
    },
    enabled: filters?.companyId !== undefined || !filters,
  });
}

export function useContact(id: string | null) {
  return useQuery({
    queryKey: crmKeys.contact(id || ""),
    queryFn: async (): Promise<Contact | null> => {
      if (!id) return null;

      const { data, error } = await supabase
        .from("crm_contacts")
        .select("*")
        .eq("id", id)
        .single();

      if (error?.code === "PGRST116") return null;
      if (error) throw new Error(`Failed to fetch contact: ${error.message}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (contact: ContactInsert): Promise<Contact> => {
      const { data, error } = await supabase
        .from("crm_contacts")
        .insert({ ...contact, email: contact.email.toLowerCase() })
        .select()
        .single();

      if (error) throw new Error(`Failed to create contact: ${error.message}`);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: crmKeys.contacts() });
      queryClient.invalidateQueries({
        queryKey: crmKeys.contactsByCompany(data.company_id),
      });
    },
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: ContactUpdate;
    }): Promise<Contact> => {
      const updateData = { ...updates, updated_at: new Date().toISOString() };
      if (updates.email) {
        updateData.email = updates.email.toLowerCase();
      }

      const { data, error } = await supabase
        .from("crm_contacts")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw new Error(`Failed to update contact: ${error.message}`);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: crmKeys.contacts() });
      queryClient.invalidateQueries({
        queryKey: crmKeys.contactsByCompany(data.company_id),
      });
      queryClient.invalidateQueries({ queryKey: crmKeys.contact(data.id) });
    },
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from("crm_contacts")
        .delete()
        .eq("id", id);

      if (error) throw new Error(`Failed to delete contact: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmKeys.contacts() });
    },
  });
}
