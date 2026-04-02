// Email CSV import hook

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type { ImportRow, ImportResult } from "../../lib/email/types";
import { emailKeys } from "./keys";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseCSV(text: string): ImportRow[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const emailIdx = headers.indexOf("email");
  if (emailIdx === -1) return [];

  const firstNameIdx = headers.indexOf("first_name");
  const lastNameIdx = headers.indexOf("last_name");
  const companyIdx = headers.indexOf("company");
  const domainIdx = headers.indexOf("domain");
  const groupIdx = headers.indexOf("group");

  return lines.slice(1).map((line) => {
    const cols = line.split(",").map((c) => c.trim());
    return {
      email: cols[emailIdx] || "",
      first_name: firstNameIdx >= 0 ? cols[firstNameIdx] : undefined,
      last_name: lastNameIdx >= 0 ? cols[lastNameIdx] : undefined,
      company: companyIdx >= 0 ? cols[companyIdx] : undefined,
      domain: domainIdx >= 0 ? cols[domainIdx] : undefined,
      group: groupIdx >= 0 ? cols[groupIdx] : undefined,
    };
  });
}

export function useImportContacts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (csvText: string): Promise<ImportResult> => {
      const rows = parseCSV(csvText);
      const result: ImportResult = {
        imported: 0,
        skipped: 0,
        errors: 0,
        errorDetails: [],
        groupsCreated: [],
      };

      if (rows.length === 0) {
        result.errorDetails.push("No valid rows found in CSV");
        return result;
      }

      // Validate and deduplicate
      const seen = new Set<string>();
      const validRows: ImportRow[] = [];

      for (const row of rows) {
        const email = row.email.toLowerCase().trim();
        if (!email) continue;

        if (!EMAIL_REGEX.test(email)) {
          result.errors++;
          result.errorDetails.push(`Invalid email: ${row.email}`);
          continue;
        }

        if (seen.has(email)) {
          result.skipped++;
          continue;
        }

        seen.add(email);
        validRows.push({ ...row, email });
      }

      if (validRows.length === 0) return result;

      // Collect unique group names from CSV
      const groupNames = [
        ...new Set(
          validRows.map((r) => r.group?.trim()).filter(Boolean) as string[]
        ),
      ];

      // Fetch existing groups
      const groupMap: Record<string, string> = {};
      if (groupNames.length > 0) {
        const { data: existingGroups } = await supabase
          .from("email_groups")
          .select("id, name")
          .in("name", groupNames);

        (existingGroups ?? []).forEach((g: any) => {
          groupMap[g.name] = g.id;
        });

        // Create missing groups
        const missingGroups = groupNames.filter((n) => !groupMap[n]);
        if (missingGroups.length > 0) {
          const { data: created, error } = await supabase
            .from("email_groups")
            .insert(missingGroups.map((name) => ({ name })))
            .select();

          if (error)
            throw new Error(`Failed to create groups: ${error.message}`);

          (created ?? []).forEach((g: any) => {
            groupMap[g.name] = g.id;
            result.groupsCreated.push(g.name);
          });
        }
      }

      // Upsert contacts in batches (into crm_contacts)
      const BATCH_SIZE = 100;
      for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
        const batch = validRows.slice(i, i + BATCH_SIZE);
        const contactInserts = batch.map((row) => ({
          email: row.email,
          name: [row.first_name, row.last_name].filter(Boolean).join(" ") || row.email,
          edm_status: "active" as const,
          source: "csv_import",
          is_active: true,
          is_primary: false,
        }));

        const { data: upserted, error } = await supabase
          .from("crm_contacts")
          .upsert(contactInserts as any, {
            onConflict: "email",
            ignoreDuplicates: true,
          })
          .select();

        if (error)
          throw new Error(`Failed to import contacts: ${error.message}`);

        const importedContacts = upserted ?? [];
        result.imported += importedContacts.length;
        result.skipped += batch.length - importedContacts.length;

        // Add contacts to their groups
        const groupLinks: { contact_id: string; group_id: string }[] = [];
        for (const contact of importedContacts) {
          const originalRow = batch.find(
            (r) => r.email === (contact as any).email
          );
          if (originalRow?.group && groupMap[originalRow.group]) {
            groupLinks.push({
              contact_id: (contact as any).id,
              group_id: groupMap[originalRow.group],
            });
          }
        }

        if (groupLinks.length > 0) {
          await supabase
            .from("email_contact_groups")
            .upsert(groupLinks, { onConflict: "contact_id,group_id" });
        }
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.contacts() });
      queryClient.invalidateQueries({ queryKey: emailKeys.groups() });
    },
  });
}
