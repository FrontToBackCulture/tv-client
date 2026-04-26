// src/modules/referrals/ReferralsModule.tsx

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Handshake, FileText, Users } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { ViewTab } from "../../components/ViewTab";
import { StatsStrip } from "../../components/StatsStrip";
import { timeAgoVerbose } from "../../lib/date";
import { supabase } from "../../lib/supabase";
import { usePartnerReferrals } from "../../hooks/usePartnerReferrals";
import { usePartnerDecks } from "../../hooks/usePartnerDecks";
import { ReferralsView } from "./ReferralsView";
import { CollateralView } from "./CollateralView";
import { PartnersView } from "./PartnersView";

type Tab = "referrals" | "collateral" | "partners";

interface PartnerRow {
  id: string;
  active: boolean;
  last_accessed: string | null;
  created_at: string;
}

function usePartnersList() {
  return useQuery({
    queryKey: ["partners", "summary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_access")
        .select("id, active, last_accessed, created_at");
      if (error) throw new Error(error.message);
      return (data ?? []) as PartnerRow[];
    },
  });
}

export function ReferralsModule() {
  const [tab, setTab] = useState<Tab>("referrals");

  const referralsQuery = usePartnerReferrals();
  const decksQuery = usePartnerDecks();
  const partnersQuery = usePartnersList();

  const stats = useMemo(() => {
    const reqs = referralsQuery.data ?? [];
    const decks = decksQuery.data ?? [];
    const parts = partnersQuery.data ?? [];
    return {
      pending: reqs.filter((r) => r.status === "pending").length,
      approved: reqs.filter((r) => r.status === "approved").length,
      rejected: reqs.filter((r) => r.status === "rejected").length,
      published: decks.filter((d) => d.published).length,
      decksTotal: decks.length,
      activePartners: parts.filter((p) => p.active).length,
      partnersTotal: parts.length,
    };
  }, [referralsQuery.data, decksQuery.data, partnersQuery.data]);

  const lastActivity = useMemo(() => {
    let max = 0;
    for (const r of referralsQuery.data ?? []) {
      const ts = new Date(r.reviewed_at ?? r.created_at).getTime();
      if (ts > max) max = ts;
    }
    for (const d of decksQuery.data ?? []) {
      const ts = new Date(d.updated_at ?? d.created_at).getTime();
      if (ts > max) max = ts;
    }
    for (const p of partnersQuery.data ?? []) {
      const ts = new Date(p.last_accessed ?? p.created_at).getTime();
      if (ts > max) max = ts;
    }
    return max > 0 ? `Last activity ${timeAgoVerbose(new Date(max).toISOString())}` : undefined;
  }, [referralsQuery.data, decksQuery.data, partnersQuery.data]);

  return (
    <div className="h-full bg-white dark:bg-zinc-950 flex flex-col">
      <PageHeader
        description={lastActivity}
        tabs={<>
          <ViewTab icon={Handshake} label="Referrals" active={tab === "referrals"} onClick={() => setTab("referrals")} />
          <ViewTab icon={FileText} label="Collateral" active={tab === "collateral"} onClick={() => setTab("collateral")} />
          <ViewTab icon={Users} label="Partners" active={tab === "partners"} onClick={() => setTab("partners")} />
        </>}
      />

      <StatsStrip stats={
        tab === "referrals"
          ? [
              { value: stats.pending, label: <>pending</>, color: stats.pending > 0 ? "amber" : "zinc" },
              { value: stats.approved, label: <>approved</>, color: "emerald" },
              { value: stats.rejected, label: <>declined</>, color: stats.rejected > 0 ? "red" : "zinc" },
            ]
          : tab === "collateral"
          ? [
              { value: stats.published, label: <>published</>, color: "emerald" },
              { value: stats.decksTotal - stats.published, label: <>hidden</>, color: "zinc" },
              { value: stats.decksTotal, label: <>total<br/>decks</>, color: "blue" },
            ]
          : [
              { value: stats.activePartners, label: <>active</>, color: "emerald" },
              { value: stats.partnersTotal - stats.activePartners, label: <>inactive</>, color: "zinc" },
              { value: stats.partnersTotal, label: <>total<br/>partners</>, color: "blue" },
            ]
      } />

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {tab === "referrals" && <ReferralsView />}
        {tab === "collateral" && <CollateralView />}
        {tab === "partners" && <PartnersView />}
      </div>
    </div>
  );
}
