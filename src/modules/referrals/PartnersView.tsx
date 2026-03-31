// src/modules/referrals/PartnersView.tsx
// View partner access codes, last accessed, and active status

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { Clock, Copy, Check } from "lucide-react";
import { useState } from "react";

interface PartnerRecord {
  id: string;
  name: string;
  code: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  active: boolean;
  last_accessed: string | null;
  created_at: string;
}

function usePartners() {
  return useQuery({
    queryKey: ["partners"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_access")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as PartnerRecord[];
    },
  });
}

export function PartnersView() {
  const { data: partners = [], isLoading } = usePartners();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-zinc-100 dark:border-zinc-800/50">
        <h1 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          Partners
        </h1>
        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
          Access codes and partner details
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-xs text-zinc-400">Loading...</p>
          </div>
        ) : partners.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-xs text-zinc-400">No partners</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
            {partners.map((p) => (
              <div
                key={p.id}
                className={`px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors ${
                  !p.active ? "opacity-50" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                        {p.name}
                      </span>
                      <span
                        className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                          p.active
                            ? "text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-900/20"
                            : "text-zinc-400 bg-zinc-100 dark:text-zinc-500 dark:bg-zinc-800"
                        }`}
                      >
                        {p.active ? "Active" : "Inactive"}
                      </span>
                    </div>
                    {p.company && (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        {p.company}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5">
                      {p.last_accessed && (
                        <span className="text-[10px] text-zinc-400 dark:text-zinc-500 flex items-center gap-1">
                          <Clock size={10} />
                          Last active{" "}
                          {new Date(p.last_accessed).toLocaleDateString("en-SG", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      )}
                      {p.email && (
                        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                          {p.email}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Access code */}
                  {p.code && (
                    <button
                      onClick={() => handleCopy(p.code!, p.id)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                      title="Copy access code"
                    >
                      <code className="text-xs font-mono text-zinc-600 dark:text-zinc-300">
                        {p.code}
                      </code>
                      {copiedId === p.id ? (
                        <Check size={12} className="text-green-500" />
                      ) : (
                        <Copy size={12} className="text-zinc-400" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
