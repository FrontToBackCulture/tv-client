// src/modules/referrals/ReferralsModule.tsx

import { useState } from "react";
import { Handshake, FileText, Users } from "lucide-react";
import { ReferralsView } from "./ReferralsView";
import { CollateralView } from "./CollateralView";
import { PartnersView } from "./PartnersView";

type Tab = "referrals" | "collateral" | "partners";

export function ReferralsModule() {
  const [tab, setTab] = useState<Tab>("referrals");

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "referrals", label: "Referrals", icon: <Handshake size={14} /> },
    { key: "collateral", label: "Collateral", icon: <FileText size={14} /> },
    { key: "partners", label: "Partners", icon: <Users size={14} /> },
  ];

  return (
    <div className="h-full bg-white dark:bg-zinc-950 flex flex-col">
      {/* Tab bar */}
      <div className="flex-shrink-0 flex border-b border-zinc-100 dark:border-zinc-800/50 px-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              tab === t.key
                ? "border-zinc-800 text-zinc-800 dark:border-zinc-200 dark:text-zinc-100"
                : "border-transparent text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {tab === "referrals" && <ReferralsView />}
        {tab === "collateral" && <CollateralView />}
        {tab === "partners" && <PartnersView />}
      </div>
    </div>
  );
}
