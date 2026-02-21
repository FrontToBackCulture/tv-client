// src/modules/crm/ClosedDealsPanel.tsx
// Side panel showing won and lost deals

import { useState } from "react";
import { X, CheckCircle, XCircle } from "lucide-react";
import { useDeals } from "../../hooks/crm";
import { DealCard } from "./DealCard";

interface ClosedDealsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ClosedDealsPanel({ isOpen, onClose }: ClosedDealsPanelProps) {
  const [activeTab, setActiveTab] = useState<"won" | "lost">("won");

  const { data: wonDeals = [], isLoading: wonLoading } = useDeals({ stage: "won" });
  const { data: lostDeals = [], isLoading: lostLoading } = useDeals({ stage: "lost" });

  if (!isOpen) return null;

  const loading = wonLoading || lostLoading;
  const wonTotal = wonDeals.reduce((sum, d) => sum + (d.value || 0), 0);
  const lostTotal = lostDeals.reduce((sum, d) => sum + (d.value || 0), 0);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-[400px] bg-white dark:bg-zinc-900 shadow-xl z-50 flex flex-col border-l border-zinc-200 dark:border-zinc-800">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-base font-semibold text-zinc-800 dark:text-zinc-100">Closed Deals</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X size={18} className="text-zinc-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex-shrink-0 flex border-b border-zinc-200 dark:border-zinc-800">
          <button
            onClick={() => setActiveTab("won")}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "won"
                ? "text-emerald-600 dark:text-emerald-400 border-b-2 border-emerald-500"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            <span className="flex items-center justify-center gap-2">
              <CheckCircle size={16} />
              Won ({wonDeals.length})
            </span>
          </button>
          <button
            onClick={() => setActiveTab("lost")}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "lost"
                ? "text-red-600 dark:text-red-400 border-b-2 border-red-500"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            <span className="flex items-center justify-center gap-2">
              <XCircle size={16} />
              Lost ({lostDeals.length})
            </span>
          </button>
        </div>

        {/* Summary */}
        <div className={`flex-shrink-0 px-4 py-2 text-sm ${
          activeTab === "won"
            ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300"
            : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300"
        }`}>
          Total: <strong>${((activeTab === "won" ? wonTotal : lostTotal) / 1000).toFixed(0)}K</strong>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-500" />
            </div>
          ) : (
            <div className="space-y-2">
              {(activeTab === "won" ? wonDeals : lostDeals).map((deal) => (
                <DealCard
                  key={deal.id}
                  deal={deal}
                  compact
                />
              ))}
              {(activeTab === "won" ? wonDeals : lostDeals).length === 0 && (
                <div className="text-center py-8 text-zinc-500 dark:text-zinc-400">
                  No {activeTab} deals yet
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
