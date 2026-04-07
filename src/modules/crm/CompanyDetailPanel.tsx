// src/modules/crm/CompanyDetailPanel.tsx
// Company detail panel with tabs for timeline, contacts, and deals

import { useState, useEffect } from "react";
import { useCompanyWithRelations, useDeleteCompany } from "../../hooks/crm";
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
  X,
  Pencil,
  Trash2,
  ExternalLink,
  FolderOpen,
  Globe,
  MessageSquare,
  Mail,
} from "lucide-react";
import { DiscussionPanel } from "../../components/discussions/DiscussionPanel";
import { useDiscussionCount } from "../../hooks/useDiscussions";
import { EmailsPanel } from "../../components/emails/EmailsPanel";
import { useLinkedEmailCount } from "../../hooks/email/useEntityEmails";
import { DetailLoading, DetailNotFound, DeleteConfirm, IconButton, Badge, Button } from "../../components/ui";
import { toast } from "../../stores/toastStore";

interface CompanyDetailPanelProps {
  companyId: string;
  onClose?: () => void;
  onCompanyUpdated?: () => void;
  onCompanyDeleted?: () => void;
}

type TabId = "timeline" | "contacts" | "deals" | "emails" | "discussion";

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
  const { data: discussionCount } = useDiscussionCount("crm_company", companyId);
  const { data: emailCount } = useLinkedEmailCount("company", companyId);

  // Report company + sub-tab to help bot
  const setViewDetail = useViewContextStore((s) => s.setDetail);
  useEffect(() => {
    const tabLabels: Record<TabId, string> = { timeline: "Timeline", contacts: "Contacts", deals: "Deals", emails: "Emails", discussion: "Discussion" };
    const name = company?.display_name || company?.name;
    if (name) setViewDetail(`${name} → ${tabLabels[activeTab]}`);
  }, [company, activeTab, setViewDetail]);
  const openPanel = useSidePanelStore((s) => s.openPanel);
  const sidePanelOpen = useSidePanelStore((s) => s.isOpen);

  // Open folder in side panel
  function handleOpenFolder(field: "client_folder_path" | "deal_folder_path" | "research_folder_path") {
    const path = company?.[field];
    if (!path) return;
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
      toast.success("Company deleted");
      onCompanyDeleted?.();
      onClose?.();
    } catch (error) {
      toast.error("Failed to delete company");
      console.error("Failed to delete company:", error);
    }
  }

  if (isLoading) return <DetailLoading />;
  if (!company) return <DetailNotFound message="Company not found" />;

  const stageConfig = COMPANY_STAGES.find((s) => s.value === company.stage);

  return (
    <div className="h-full flex flex-col bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 space-y-3">
        {/* Company name + actions */}
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
              <IconButton icon={Pencil} size={14} label="Edit company" onClick={() => setShowEditForm(true)} />
              <IconButton icon={Trash2} size={14} label="Delete company" variant="danger" onClick={() => setShowDeleteConfirm(true)} />
            </div>
            {company.industry && (
              <span className="text-xs text-zinc-400 dark:text-zinc-500">{company.industry}</span>
            )}
            {company.hiring_signals && (company.hiring_signals as any).active_jobs?.length > 0 && (
              <div className="mt-1 flex items-center gap-1.5">
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                  Hiring: {(company.hiring_signals as any).active_jobs.map((j: any) => j.title).join(", ")}
                </span>
              </div>
            )}
          </div>
          {onClose && (
            <IconButton icon={X} size={18} label="Close" onClick={onClose} />
          )}
        </div>

        {/* Quick stats */}
        <div className="flex gap-3">
          <div className="flex-1 rounded-md bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 px-3 py-2 text-center">
            <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{company.contacts?.length || 0}</div>
            <div className="text-xs text-zinc-400 dark:text-zinc-500">Contacts</div>
          </div>
          <div className="flex-1 rounded-md bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 px-3 py-2 text-center">
            <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{company.activeDealCount || 0}</div>
            <div className="text-xs text-zinc-400 dark:text-zinc-500">Active Deals</div>
          </div>
          <div className="flex-1 rounded-md bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 px-3 py-2 text-center">
            <div className="text-sm font-semibold text-teal-600 dark:text-teal-400">${((company.totalDealValue || 0) / 1000).toFixed(0)}K</div>
            <div className="text-xs text-zinc-400 dark:text-zinc-500">Won</div>
          </div>
        </div>

        {/* Quick links */}
        {(company.client_folder_path || company.deal_folder_path || company.research_folder_path || company.domain_id || company.website) && (
          <div className="flex gap-2">
            {company.client_folder_path && (
              <Button variant="link" size="sm" icon={FolderOpen} onClick={() => handleOpenFolder("client_folder_path")} className="text-xs py-1">
                Client
              </Button>
            )}
            {company.deal_folder_path && (
              <Button variant="link" size="sm" icon={FolderOpen} onClick={() => handleOpenFolder("deal_folder_path")} className="text-xs py-1">
                Deal
              </Button>
            )}
            {company.research_folder_path && (
              <Button variant="link" size="sm" icon={FolderOpen} onClick={() => handleOpenFolder("research_folder_path")} className="text-xs py-1">
                Research
              </Button>
            )}
            {company.domain_id && (
              <Button variant="link" size="sm" icon={ExternalLink} className="text-xs py-1">
                Domain
              </Button>
            )}
            {company.website && (
              <a
                href={company.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs px-3 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-md text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors font-medium"
              >
                <Globe size={14} />
                Website
              </a>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-800">
        {(["timeline", "contacts", "deals", "emails", "discussion"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            data-help-id={`crm-detail-${tab}`}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1 ${
              activeTab === tab
                ? "border-teal-500 text-teal-600 dark:text-teal-400"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            {tab === "discussion" ? (
              <>
                <MessageSquare size={13} />
                {(discussionCount ?? 0) > 0 && (
                  <span className="text-[10px] bg-zinc-200 dark:bg-zinc-800 px-1 py-0.5 rounded-full">
                    {discussionCount}
                  </span>
                )}
              </>
            ) : tab === "emails" ? (
              <>
                <Mail size={13} />
                Emails
                {(emailCount ?? 0) > 0 && (
                  <span className="text-[10px] bg-zinc-200 dark:bg-zinc-800 px-1 py-0.5 rounded-full">
                    {emailCount}
                  </span>
                )}
              </>
            ) : (
              <>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                {tab === "contacts" && ` (${company.contacts?.length || 0})`}
                {tab === "deals" && ` (${company.deals?.length || 0})`}
              </>
            )}
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
              <Button onClick={() => setShowContactForm(true)} data-help-id="crm-add-contact">
                + Add Contact
              </Button>
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
              <Button onClick={() => setShowDealForm(true)} data-help-id="crm-add-deal">
                + Add Deal
              </Button>
            </div>
            <div className="space-y-3">
              {company.deals?.map((deal) => (
                <div
                  key={deal.id}
                  className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden"
                >
                  <DealCard deal={deal} showTasks={false} onDealUpdated={() => refetch()} />
                  <div className="border-t border-zinc-200 dark:border-zinc-800">
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
        {activeTab === "emails" && (
          <EmailsPanel entityType="company" entityId={companyId} />
        )}
        {activeTab === "discussion" && (
          <DiscussionPanel
            entityType="crm_company"
            entityId={companyId}
          />
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

      {showDeleteConfirm && (
        <DeleteConfirm
          title="Delete Company"
          message={<>Delete <strong>{company?.display_name || company?.name}</strong> and all associated contacts, deals, and activities? This cannot be undone.</>}
          isDeleting={deleteMutation.isPending}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}

const stageColors: Record<string, "zinc" | "blue" | "green" | "red" | "purple"> = {
  prospect: "zinc",
  opportunity: "blue",
  client: "green",
  churned: "red",
  partner: "purple",
};

function StageChip({ stage, label }: { stage: string; label: string }) {
  return <Badge color={stageColors[stage] || "zinc"}>{label}</Badge>;
}
