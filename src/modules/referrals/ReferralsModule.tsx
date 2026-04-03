// src/modules/referrals/ReferralsModule.tsx

import { useState } from "react";
import { Handshake, FileText, Users } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { ViewTab } from "../../components/ViewTab";
import { ReferralsView } from "./ReferralsView";
import { CollateralView } from "./CollateralView";
import { PartnersView } from "./PartnersView";

type Tab = "referrals" | "collateral" | "partners";

export function ReferralsModule() {
  const [tab, setTab] = useState<Tab>("referrals");

  return (
    <div className="h-full bg-white dark:bg-zinc-950 flex flex-col">
      <PageHeader
        description="Track partner referrals, manage collateral, and monitor partner activity."
        tabs={<>
          <ViewTab icon={Handshake} label="Referrals" active={tab === "referrals"} onClick={() => setTab("referrals")} />
          <ViewTab icon={FileText} label="Collateral" active={tab === "collateral"} onClick={() => setTab("collateral")} />
          <ViewTab icon={Users} label="Partners" active={tab === "partners"} onClick={() => setTab("partners")} />
        </>}
      />

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {tab === "referrals" && <ReferralsView />}
        {tab === "collateral" && <CollateralView />}
        {tab === "partners" && <PartnersView />}
      </div>
    </div>
  );
}
