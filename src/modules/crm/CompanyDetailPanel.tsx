// src/modules/crm/CompanyDetailPanel.tsx
// Company detail panel with tabs for timeline, contacts, and deals

import { useState, useEffect } from "react";
import { useCompanyWithRelations, useDeleteCompany } from "../../hooks/useCRM";
import { useViewContextStore } from "../../stores/viewContextStore";
import { COMPANY_STAGES } from "../../lib/crm/types";
import { useSidePanelStore } from "../../stores/sidePanelStore";
import { ActivityTimeline } from "./ActivityTimeline";
import { ContactListView } from "./ContactListView";
import { DealCard } from "./DealCard";
import { DealTasks } from "./DealTasks";
import { CompanyForm } from "./CompanyForm";
import { ContactForm } from "./ContactForm";
import { DealForm } from "./DealForm";
import {
  Loader2,
  X,
  Pencil,
  Trash2,
  ExternalLink,
  FolderOpen,
  Globe,
} from "lucide-react";

interface CompanyDetailPanelProps {
  companyId: string;
  onClose?: () => void;
  onCompanyUpdated?: () => void;
  onCompanyDeleted?: () => void;
}

type TabId = "timeline" | "contacts" | "deals";

export function CompanyDetailPanel({
  companyId,
  onClose,
  onCompanyUpdated,
  onCompanyDeleted,
}: CompanyDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>("timeline");
  const [showEditForm, setShowEditForm] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const [showDealForm, setShowDealForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { data: company, isLoading, refetch } = useCompanyWithRelations(companyId);
  const deleteMutation = useDeleteCompany();

  // Report company + sub-tab to help bot
  const setViewDetail = useViewContextStore((s) => s.setDetail);
  useEffect(() => {
    const tabLabels: Record<TabId, string> = { timeline: "Timeline", contacts: "Contacts", deals: "Deals" };
    const name = company?.display_name || company?.name;
    if (name) setViewDetail(`${name} → ${tabLabels[activeTab]}`);
  }, [company, activeTab, setViewDetail]);
  const { openPanel, isOpen: sidePanelOpen } = useSidePanelStore();

  // Open client folder in side panel
  function handleOpenFolder() {
    if (!company?.client_folder_path) return;
    // If it's a file path, open it directly; if folder, open with picker
    const path = company.client_folder_path;
    const name = path.split("/").pop() || "Client Folder";
    // Check if it looks like a file (has extension) or folder
    const hasExtension = /\.[^/]+$/.test(path);
    if (hasExtension) {
      openPanel(path, name);
    } else {
      // For folders, open the side panel and let user browse
      useSidePanelStore.getState().openPicker();
      if (!sidePanelOpen) {
        useSidePanelStore.setState({ isOpen: true });
      }
    }
  }

  async function handleDelete() {
    try {
      await deleteMutation.mutateAsync(companyId);
      onCompanyDeleted?.();
      onClose?.();
    } catch (error) {
      console.error("Failed to delete company:", error);
    }
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50 dark:bg-zinc-950">
        <Loader2 size={24} className="text-zinc-400 dark:text-zinc-600 animate-spin" />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50 dark:bg-zinc-950">
        <p className="text-zinc-500">Company not found</p>
      </div>
    );
  }

  const stageConfig = COMPANY_STAGES.find((s) => s.value === company.stage);

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-zinc-800">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                {company.display_name || company.name}
              </h2>
              <StageChip
                stage={company.stage}
                label={stageConfig?.label || company.stage}
              />
              <button
                onClick={() => setShowEditForm(true)}
                className="p-1 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                title="Edit company"
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="p-1 text-zinc-500 hover:text-red-500 dark:hover:text-red-400 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                title="Delete company"
              >
                <Trash2 size={14} />
              </button>
            </div>
            {company.industry && (
              <span className="text-xs text-zinc-500">{company.industry}</span>
            )}
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Quick stats */}
        <div className="flex gap-4 mt-2 text-xs">
          <div className="text-zinc-500">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              {company.contacts?.length || 0}
            </span>{" "}
            contacts
          </div>
          <div className="text-zinc-500">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              {company.activeDealCount || 0}
            </span>{" "}
            active deals
          </div>
          <div className="text-zinc-500">
            <span className="font-medium text-teal-600 dark:text-teal-400">
              ${((company.totalDealValue || 0) / 1000).toFixed(0)}K
            </span>{" "}
            won
          </div>
        </div>

        {/* Quick links */}
        {(company.client_folder_path || company.domain_id || company.website) && (
          <div className="flex gap-2 mt-2">
            {company.client_folder_path && (
              <button
                onClick={handleOpenFolder}
                className="flex items-center gap-1 text-[11px] px-2 py-1 bg-slate-100 dark:bg-zinc-800 rounded hover:bg-slate-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 transition-colors"
                title="Open in side panel"
              >
                <FolderOpen size={12} />
                Folder
              </button>
            )}
            {company.domain_id && (
              <button className="flex items-center gap-1 text-[11px] px-2 py-1 bg-slate-100 dark:bg-zinc-800 rounded hover:bg-slate-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 transition-colors">
                <ExternalLink size={12} />
                Domain
              </button>
            )}
            {company.website && (
              <a
                href={company.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[11px] px-2 py-1 bg-slate-100 dark:bg-zinc-800 rounded hover:bg-slate-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 transition-colors"
              >
                <Globe size={12} />
                Website
              </a>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-zinc-800">
        {(["timeline", "contacts", "deals"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            data-help-id={`crm-detail-${tab}`}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? "border-teal-500 text-teal-600 dark:text-teal-400"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === "contacts" && ` (${company.contacts?.length || 0})`}
            {tab === "deals" && ` (${company.deals?.length || 0})`}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {activeTab === "timeline" && (
          <ActivityTimeline
            companyId={companyId}
            activities={company.activities || []}
            onActivityAdded={() => refetch()}
          />
        )}
        {activeTab === "contacts" && (
          <div className="p-4">
            <div className="flex justify-end mb-3">
              <button
                onClick={() => setShowContactForm(true)}
                data-help-id="crm-add-contact"
                className="px-3 py-1.5 text-sm bg-teal-600 text-white rounded-md hover:bg-teal-500 transition-colors"
              >
                + Add Contact
              </button>
            </div>
            <ContactListView
              contacts={company.contacts || []}
              onContactUpdated={() => refetch()}
            />
          </div>
        )}
        {activeTab === "deals" && (
          <div className="p-4">
            <div className="flex justify-end mb-3">
              <button
                onClick={() => setShowDealForm(true)}
                data-help-id="crm-add-deal"
                className="px-3 py-1.5 text-sm bg-teal-600 text-white rounded-md hover:bg-teal-500 transition-colors"
              >
                + Add Deal
              </button>
            </div>
            <div className="space-y-3">
              {company.deals?.map((deal) => (
                <div
                  key={deal.id}
                  className="border border-slate-200 dark:border-zinc-700 rounded-lg overflow-hidden"
                >
                  <DealCard deal={deal} showTasks={false} onDealUpdated={() => refetch()} />
                  <div className="border-t border-slate-200 dark:border-zinc-700">
                    <DealTasks
                      dealId={deal.id}
                      dealName={deal.name}
                      onTaskCreated={() => refetch()}
                    />
                  </div>
                </div>
              ))}
              {(!company.deals || company.deals.length === 0) && (
                <p className="text-zinc-500 text-sm text-center py-8">No deals yet</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showEditForm && (
        <CompanyForm
          company={company}
          onClose={() => setShowEditForm(false)}
          onSaved={() => {
            setShowEditForm(false);
            refetch();
            onCompanyUpdated?.();
          }}
        />
      )}
      {showContactForm && (
        <ContactForm
          companyId={companyId}
          onClose={() => setShowContactForm(false)}
          onSaved={() => {
            setShowContactForm(false);
            refetch();
          }}
        />
      )}
      {showDealForm && (
        <DealForm
          companyId={companyId}
          onClose={() => setShowDealForm(false)}
          onSaved={() => {
            setShowDealForm(false);
            refetch();
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg p-5 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
              Delete Company
            </h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
              Delete <strong>{company?.display_name || company?.name}</strong> and
              all associated contacts, deals, and activities? This cannot be
              undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
                disabled={deleteMutation.isPending}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-500 disabled:opacity-50 transition-colors"
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StageChip({ stage, label }: { stage: string; label: string }) {
  const colors: Record<string, string> = {
    prospect: "bg-slate-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400",
    opportunity: "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400",
    client: "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400",
    churned: "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400",
    partner: "bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-400",
  };

  return (
    <span
      className={`px-2 py-0.5 rounded text-xs font-medium ${
        colors[stage] || colors.prospect
      }`}
    >
      {label}
    </span>
  );
}
