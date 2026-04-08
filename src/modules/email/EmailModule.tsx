// src/modules/email/EmailModule.tsx
// Email module — EDM campaigns, contacts, groups, templates, and campaign analytics

import { useState, useEffect } from "react";
import type { EmailCampaignWithStats } from "../../lib/email/types";
import { ContactsView } from "./ContactsView";
import { GroupsView } from "./GroupsView";
import { CampaignsView } from "./CampaignsView";
import { AnalyticsView } from "./AnalyticsView";
import { TemplatesView } from "./TemplatesView";
import { ContactDetailPanel } from "./ContactDetailPanel";
import { GroupDetailPanel } from "./GroupDetailPanel";
import { CampaignDetailPanel } from "./CampaignDetailPanel";
import { ContactForm } from "./ContactForm";
import { GroupForm } from "./GroupForm";
import { CampaignForm } from "./CampaignForm";
import { ImportModal } from "./ImportModal";
import { Users, FolderOpen, Send, BarChart3, LayoutTemplate } from "lucide-react";
import { ViewTab } from "../../components/ViewTab";
import { PageHeader } from "../../components/PageHeader";
import { useViewContextStore } from "../../stores/viewContextStore";
import { useNotificationNavStore } from "../../stores/notificationNavStore";
import { ResizablePanel } from "../../components/ResizablePanel";

type EmailView = "contacts" | "groups" | "campaigns" | "templates" | "analytics";

export function EmailModule() {
  const [activeView, setActiveViewRaw] = useState<EmailView>(
    () => (localStorage.getItem("email-active-tab") as EmailView) || "contacts"
  );
  const setActiveView = (v: EmailView) => {
    localStorage.setItem("email-active-tab", v);
    setActiveViewRaw(v);
  };
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [showContactForm, setShowContactForm] = useState(false);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [showCampaignForm, setShowCampaignForm] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<EmailCampaignWithStats | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);

  // Handle notification navigation
  const navTarget = useNotificationNavStore((s) => s.target);
  const clearNavTarget = useNotificationNavStore((s) => s.clearTarget);
  useEffect(() => {
    if (navTarget?.entityType === "campaign") {
      setActiveView("campaigns");
      setSelectedCampaignId(navTarget.entityId);
      clearNavTarget();
    }
  }, [navTarget, clearNavTarget]);

  // Report view context for help bot
  const setViewContext = useViewContextStore((s) => s.setView);
  useEffect(() => {
    const labels: Record<EmailView, string> = {
      contacts: "Contacts",
      groups: "Groups",
      campaigns: "Campaigns",
      templates: "Templates",
      analytics: "Analytics",
    };
    setViewContext(activeView, labels[activeView]);
  }, [activeView, setViewContext]);

  // Clear selections when switching tabs
  useEffect(() => {
    setSelectedContactId(null);
    setSelectedGroupId(null);
    setSelectedCampaignId(null);
  }, [activeView]);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      <PageHeader
        description="Email marketing — manage contacts, build groups, create campaigns, and track performance."
        tabs={<>
          <ViewTab label="Contacts" icon={Users} active={activeView === "contacts"} onClick={() => setActiveView("contacts")} />
          <ViewTab label="Groups" icon={FolderOpen} active={activeView === "groups"} onClick={() => setActiveView("groups")} />
          <ViewTab label="Campaigns" icon={Send} active={activeView === "campaigns"} onClick={() => setActiveView("campaigns")} />
          <ViewTab label="Templates" icon={LayoutTemplate} active={activeView === "templates"} onClick={() => setActiveView("templates")} />
          <ViewTab label="Analytics" icon={BarChart3} active={activeView === "analytics"} onClick={() => setActiveView("analytics")} />
        </>}
      />

      {/* Content + detail panel */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-auto">
          {activeView === "contacts" && (
            <ContactsView
              selectedId={selectedContactId}
              onSelect={setSelectedContactId}
              onNewContact={() => setShowContactForm(true)}
              onImport={() => setShowImportModal(true)}
            />
          )}
          {activeView === "groups" && (
            <GroupsView
              selectedId={selectedGroupId}
              onSelect={setSelectedGroupId}
              onNewGroup={() => setShowGroupForm(true)}
            />
          )}
          {activeView === "campaigns" && (
            <CampaignsView
              selectedId={selectedCampaignId}
              onSelect={setSelectedCampaignId}
              onNewCampaign={() => setShowCampaignForm(true)}
            />
          )}
          {activeView === "templates" && <TemplatesView />}
          {activeView === "analytics" && (
            <AnalyticsView onSelectCampaign={(id) => {
              setSelectedCampaignId(id);
              setActiveView("campaigns");
            }} />
          )}
        </div>

        {/* Detail panels */}
        {selectedContactId && activeView === "contacts" && (
          <ResizablePanel storageKey="tv-email-detail-width" defaultWidth={420} minWidth={320} maxWidth={700}>
            <ContactDetailPanel
              contactId={selectedContactId}
              onClose={() => setSelectedContactId(null)}
            />
          </ResizablePanel>
        )}
        {selectedGroupId && activeView === "groups" && (
          <ResizablePanel storageKey="tv-email-detail-width" defaultWidth={420} minWidth={320} maxWidth={700}>
            <GroupDetailPanel
              groupId={selectedGroupId}
              onClose={() => setSelectedGroupId(null)}
            />
          </ResizablePanel>
        )}
        {selectedCampaignId && activeView === "campaigns" && (
          <ResizablePanel storageKey="tv-email-detail-width" defaultWidth={420} minWidth={320} maxWidth={700}>
            <CampaignDetailPanel
              campaignId={selectedCampaignId}
              onClose={() => setSelectedCampaignId(null)}
              onEdit={(campaign) => {
                setEditingCampaign(campaign);
                setShowCampaignForm(true);
              }}
            />
          </ResizablePanel>
        )}
      </div>

      {/* Modals */}
      {showContactForm && (
        <ContactForm onClose={() => setShowContactForm(false)} />
      )}
      {showGroupForm && (
        <GroupForm onClose={() => setShowGroupForm(false)} />
      )}
      {showCampaignForm && (
        <CampaignForm
          campaign={editingCampaign}
          onClose={() => {
            setShowCampaignForm(false);
            setEditingCampaign(null);
          }}
        />
      )}
      {showImportModal && (
        <ImportModal onClose={() => setShowImportModal(false)} />
      )}
    </div>
  );
}
