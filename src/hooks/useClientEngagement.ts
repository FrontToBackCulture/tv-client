// src/hooks/useClientEngagement.ts
// Fetches engagement data for a list of client companies:
// - Latest activity per company
// - 30-day activity count per company
// - Primary contact per company

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { crmKeys } from "./useCRM";
import { getEngagementHealth, type EngagementHealth } from "../modules/crm/CrmComponents";
import type { Activity } from "../lib/crm/types";

export interface ClientEngagementData {
  lastActivity: Pick<Activity, "type" | "subject" | "activity_date"> | null;
  activityCount30d: number;
  primaryContactName: string | null;
  health: EngagementHealth;
}

export function useClientEngagement(companyIds: string[]) {
  const idsKey = companyIds.slice().sort().join(",");

  return useQuery({
    queryKey: [...crmKeys.activities(), "client-engagement", idsKey],
    queryFn: async (): Promise<Map<string, ClientEngagementData>> => {
      if (companyIds.length === 0) return new Map();

      // Run 3 parallel queries
      const [latestResult, countResult, contactResult] = await Promise.all([
        // 1. Latest activity per company
        // Supabase doesn't support DISTINCT ON, so fetch recent activities and dedupe client-side
        supabase
          .from("crm_activities")
          .select("company_id, type, subject, activity_date")
          .in("company_id", companyIds)
          .order("activity_date", { ascending: false })
          .limit(companyIds.length * 3),

        // 2. Activities in last 30 days per company
        supabase
          .from("crm_activities")
          .select("company_id")
          .in("company_id", companyIds)
          .gte("activity_date", new Date(Date.now() - 30 * 86400000).toISOString()),

        // 3. Primary contacts
        supabase
          .from("crm_contacts")
          .select("company_id, name")
          .in("company_id", companyIds)
          .eq("is_primary", true),
      ]);

      // Build latest activity map (first seen per company_id = most recent)
      const latestMap = new Map<string, Pick<Activity, "type" | "subject" | "activity_date">>();
      for (const row of latestResult.data ?? []) {
        if (!latestMap.has(row.company_id)) {
          latestMap.set(row.company_id, {
            type: row.type,
            subject: row.subject,
            activity_date: row.activity_date,
          });
        }
      }

      // Build 30d count map
      const countMap = new Map<string, number>();
      for (const row of countResult.data ?? []) {
        countMap.set(row.company_id, (countMap.get(row.company_id) || 0) + 1);
      }

      // Build primary contact map
      const contactMap = new Map<string, string>();
      for (const row of contactResult.data ?? []) {
        contactMap.set(row.company_id, row.name);
      }

      // Assemble result
      const result = new Map<string, ClientEngagementData>();
      for (const id of companyIds) {
        const lastActivity = latestMap.get(id) || null;
        result.set(id, {
          lastActivity,
          activityCount30d: countMap.get(id) || 0,
          primaryContactName: contactMap.get(id) || null,
          health: getEngagementHealth(lastActivity?.activity_date),
        });
      }

      return result;
    },
    enabled: companyIds.length > 0,
    staleTime: 60_000, // 1 minute
  });
}
