// src/modules/email/EmailModule.tsx
// Main Email module with 4-tab layout: Contacts, Groups, Campaigns, Analytics

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
import { useViewContextStore } from "../../stores/viewContextStore";
import { useNotificationNavStore } from "../../stores/notificationNavStore";

type EmailView = "contacts" | "groups" | "campaigns" | "templates" | "analytics";

export function EmailModule() {
  const [activeView, setActiveView] = useState<EmailView>("contacts");
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
      {/* Tab bar */}
      <div className="flex-shrink-0 flex items-center border-b border-zinc-100 dark:border-zinc-800/50 px-4">
        <div className="flex">
          <ViewTab label="Contacts" icon={Users} active={activeView === "contacts"} onClick={() => setActiveView("contacts")} />
          <ViewTab label="Groups" icon={FolderOpen} active={activeView === "groups"} onClick={() => setActiveView("groups")} />
          <ViewTab label="Campaigns" icon={Send} active={activeView === "campaigns"} onClick={() => setActiveView("campaigns")} />
          <ViewTab label="Templates" icon={LayoutTemplate} active={activeView === "templates"} onClick={() => setActiveView("templates")} />
          <ViewTab label="Analytics" icon={BarChart3} active={activeView === "analytics"} onClick={() => setActiveView("analytics")} />
        </div>
      </div>

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
          <ContactDetailPanel
            contactId={selectedContactId}
            onClose={() => setSelectedContactId(null)}
          />
        )}
        {selectedGroupId && activeView === "groups" && (
          <GroupDetailPanel
            groupId={selectedGroupId}
            onClose={() => setSelectedGroupId(null)}
          />
        )}
        {selectedCampaignId && activeView === "campaigns" && (
          <CampaignDetailPanel
            campaignId={selectedCampaignId}
            onClose={() => setSelectedCampaignId(null)}
            onEdit={(campaign) => {
              setEditingCampaign(campaign);
              setShowCampaignForm(true);
            }}
          />
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
