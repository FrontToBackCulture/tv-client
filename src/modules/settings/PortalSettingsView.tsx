// Settings: Portal Settings View + PortalSiteCard

import { useState } from "react";
import {
  Check,
  Loader2,
  RefreshCw,
  Globe,
  Palette,
} from "lucide-react";
import { usePortalSites, useCreateSite, useUpdateSite, useDeleteSite } from "../../hooks/portal";
import type { PortalSite } from "../../lib/portal/types";
import { cn } from "../../lib/cn";

const FEATURE_CONFIG = [
  { key: "chat", label: "Chat", desc: "Live chat with customers", icon: "\u{1F4AC}" },
  { key: "help_center", label: "Help Center", desc: "Knowledge base articles", icon: "\u{1F4D6}" },
  { key: "sitemap", label: "My Resources", desc: "Dashboards, workflows, tables", icon: "\u{1F5C2}\uFE0F" },
  { key: "changelog", label: "Changelog", desc: "What's New updates", icon: "\u{1F4E2}" },
  { key: "banners", label: "Banners", desc: "Top-bar announcements", icon: "\u{1F514}" },
  { key: "popups", label: "Popups", desc: "Modal announcements", icon: "\u{1F4A1}" },
  { key: "incidents", label: "Incidents", desc: "Status page", icon: "\u26A0\uFE0F" },
] as const;

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function PortalSiteCard({ site }: { site: PortalSite }) {
  const updateSite = useUpdateSite();
  const deleteSite = useDeleteSite();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(site.name);
  const [editSlug, setEditSlug] = useState(site.slug);
  const [editUrl, setEditUrl] = useState(site.base_url || "");

  // Branding state
  const siteConfig = site.config as Record<string, unknown> | undefined;
  const currentBranding = (siteConfig?.branding || {}) as Record<string, string>;
  const [brandPrimary, setBrandPrimary] = useState(currentBranding.primary_color || "#1E3A5F");
  const [brandAccent, setBrandAccent] = useState(currentBranding.accent_color || "#0D7D85");
  const [brandLogo, setBrandLogo] = useState(currentBranding.logo_url || "");
  const [brandGreeting, setBrandGreeting] = useState(currentBranding.greeting || "Hey there \u{1F44B}");
  const [brandSubtext, setBrandSubtext] = useState(currentBranding.greeting_subtext || "What can we help with?");
  const [brandingDirty, setBrandingDirty] = useState(false);

  const handleBrandingSave = () => {
    updateSite.mutate(
      {
        id: site.id,
        branding: {
          primary_color: brandPrimary,
          accent_color: brandAccent,
          logo_url: brandLogo,
          greeting: brandGreeting,
          greeting_subtext: brandSubtext,
        },
      },
      { onSuccess: () => setBrandingDirty(false) }
    );
  };

  const markBrandingDirty = () => { if (!brandingDirty) setBrandingDirty(true); };

  const getFeature = (key: string): boolean => {
    const config = site.config as Record<string, unknown> | undefined;
    const features = config?.features as Record<string, boolean> | undefined;
    return features?.[key] ?? true;
  };

  const toggleFeature = (key: string) => {
    const current = getFeature(key);
    updateSite.mutate({ id: site.id, features: { [key]: !current } });
  };

  const enabledCount = FEATURE_CONFIG.filter((f) => getFeature(f.key)).length;

  const handleSave = () => {
    if (!editName.trim() || !editSlug.trim()) return;
    updateSite.mutate(
      { id: site.id, name: editName.trim(), slug: editSlug.trim(), base_url: editUrl.trim() },
      { onSuccess: () => setIsEditing(false) }
    );
  };

  const handleDelete = () => {
    if (!confirm(`Delete site "${site.name}"? This cannot be undone.`)) return;
    deleteSite.mutate(site.id);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditName(site.name);
    setEditSlug(site.slug);
    setEditUrl(site.base_url || "");
  };

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
      {/* Collapsed header — always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-900/30 flex items-center justify-center flex-shrink-0">
            <Globe size={16} className="text-teal-600 dark:text-teal-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm text-zinc-900 dark:text-zinc-100 truncate">
                {site.name}
              </span>
              <span className="text-[10px] font-mono text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded flex-shrink-0">
                {site.slug}
              </span>
            </div>
            {site.base_url && (
              <div className="text-[11px] text-zinc-400 font-mono truncate">{site.base_url}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-[11px] text-zinc-400">
            {enabledCount}/{FEATURE_CONFIG.length} features
          </span>
          <RefreshCw
            size={14}
            className={cn(
              "text-zinc-400 transition-transform",
              isExpanded && "rotate-180"
            )}
          />
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-zinc-200 dark:border-zinc-800">
          {/* Site details */}
          <div className="px-4 py-3 bg-zinc-50/50 dark:bg-zinc-900/30">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                Site Details
              </h4>
              <div className="flex items-center gap-1">
                {!isEditing && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
                      className="px-2.5 py-1 text-xs text-zinc-500 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-white dark:hover:bg-zinc-800 rounded transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(); }}
                      disabled={deleteSite.isPending}
                      className="px-2.5 py-1 text-xs text-zinc-400 hover:text-red-500 hover:bg-white dark:hover:bg-zinc-800 rounded transition-colors disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>

            {isEditing ? (
              <div className="space-y-3">
                <div className="grid grid-cols-[1fr_140px] gap-3">
                  <div>
                    <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1 uppercase tracking-wide">
                      Name
                    </label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Site name"
                      className="w-full px-2.5 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1 uppercase tracking-wide">
                      Slug
                    </label>
                    <input
                      type="text"
                      value={editSlug}
                      onChange={(e) => setEditSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                      placeholder="slug"
                      className="w-full px-2.5 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1 uppercase tracking-wide">
                    Base URL
                  </label>
                  <input
                    type="url"
                    value={editUrl}
                    onChange={(e) => setEditUrl(e.target.value)}
                    placeholder="https://example.com (optional)"
                    className="w-full px-2.5 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-mono"
                  />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={handleSave}
                    disabled={updateSite.isPending || !editName.trim() || !editSlug.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-600 hover:bg-teal-500 text-white rounded-md transition-colors disabled:opacity-50"
                  >
                    {updateSite.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    Save
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-0.5">Name</div>
                  <div className="text-zinc-900 dark:text-zinc-100">{site.name}</div>
                </div>
                <div>
                  <div className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-0.5">Slug</div>
                  <div className="text-zinc-900 dark:text-zinc-100 font-mono">{site.slug}</div>
                </div>
                <div>
                  <div className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-0.5">Base URL</div>
                  <div className="text-zinc-900 dark:text-zinc-100 font-mono text-xs truncate">
                    {site.base_url || <span className="text-zinc-300 dark:text-zinc-600">&mdash;</span>}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Feature toggles */}
          <div className="px-4 py-3">
            <h4 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-3">
              Widget Features
            </h4>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              {FEATURE_CONFIG.map(({ key, label, desc, icon }) => {
                const enabled = getFeature(key);
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between py-2 group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-sm flex-shrink-0">{icon}</span>
                      <div className="min-w-0">
                        <div className="text-sm text-zinc-900 dark:text-zinc-100">{label}</div>
                        <div className="text-[11px] text-zinc-400 truncate">{desc}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => toggleFeature(key)}
                      className={cn(
                        "w-9 h-5 rounded-full transition-colors relative flex-shrink-0 ml-3",
                        enabled ? "bg-teal-500" : "bg-zinc-300 dark:bg-zinc-600"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform",
                          enabled ? "translate-x-[18px]" : "translate-x-0.5"
                        )}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Branding */}
          <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Palette size={14} className="text-zinc-400" />
                <h4 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                  Branding
                </h4>
              </div>
              {brandingDirty && (
                <button
                  onClick={handleBrandingSave}
                  disabled={updateSite.isPending}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-teal-600 hover:bg-teal-500 text-white rounded transition-colors disabled:opacity-50"
                >
                  {updateSite.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  Save
                </button>
              )}
            </div>

            <div className="space-y-3">
              {/* Colors */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1 uppercase tracking-wide">
                    Primary Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={brandPrimary}
                      onChange={(e) => { setBrandPrimary(e.target.value); markBrandingDirty(); }}
                      className="w-8 h-8 rounded border border-zinc-300 dark:border-zinc-700 cursor-pointer p-0.5"
                    />
                    <input
                      type="text"
                      value={brandPrimary}
                      onChange={(e) => { setBrandPrimary(e.target.value); markBrandingDirty(); }}
                      className="flex-1 px-2 py-1.5 text-xs font-mono border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1 uppercase tracking-wide">
                    Accent Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={brandAccent}
                      onChange={(e) => { setBrandAccent(e.target.value); markBrandingDirty(); }}
                      className="w-8 h-8 rounded border border-zinc-300 dark:border-zinc-700 cursor-pointer p-0.5"
                    />
                    <input
                      type="text"
                      value={brandAccent}
                      onChange={(e) => { setBrandAccent(e.target.value); markBrandingDirty(); }}
                      className="flex-1 px-2 py-1.5 text-xs font-mono border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                </div>
              </div>

              {/* Logo URL */}
              <div>
                <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1 uppercase tracking-wide">
                  Logo URL
                </label>
                <input
                  type="url"
                  value={brandLogo}
                  onChange={(e) => { setBrandLogo(e.target.value); markBrandingDirty(); }}
                  placeholder="https://example.com/logo.png (optional)"
                  className="w-full px-2.5 py-1.5 text-xs border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-mono placeholder:text-zinc-400"
                />
              </div>

              {/* Greeting */}
              <div>
                <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1 uppercase tracking-wide">
                  Greeting
                </label>
                <input
                  type="text"
                  value={brandGreeting}
                  onChange={(e) => { setBrandGreeting(e.target.value); markBrandingDirty(); }}
                  placeholder="Hey there \u{1F44B}"
                  className="w-full px-2.5 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
                />
              </div>

              {/* Greeting subtext */}
              <div>
                <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1 uppercase tracking-wide">
                  Greeting Subtext
                </label>
                <input
                  type="text"
                  value={brandSubtext}
                  onChange={(e) => { setBrandSubtext(e.target.value); markBrandingDirty(); }}
                  placeholder="What can we help with?"
                  className="w-full px-2.5 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
                />
              </div>

              {/* Preview swatch */}
              <div className="mt-2">
                <div
                  className="h-12 rounded-lg flex items-center px-4 gap-2"
                  style={{ background: `linear-gradient(135deg, ${brandPrimary} 0%, ${brandAccent} 100%)` }}
                >
                  <span className="text-white text-sm font-bold truncate">{brandGreeting}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function PortalSettingsView() {
  const { data: sites, isLoading } = usePortalSites();
  const createSite = useCreateSite();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newUrl, setNewUrl] = useState("");

  const handleCreate = async () => {
    if (!newName.trim() || !newSlug.trim()) return;
    try {
      await createSite.mutateAsync({ name: newName.trim(), slug: newSlug.trim(), base_url: newUrl.trim() || undefined });
      setNewName("");
      setNewSlug("");
      setNewUrl("");
      setShowCreate(false);
    } catch (err) {
      console.error("[portal] Failed to create site:", err);
    }
  };

  // Auto-generate slug from name
  const handleNameChange = (val: string) => {
    setNewName(val);
    if (!newSlug || newSlug === slugify(newName)) {
      setNewSlug(slugify(val));
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center py-12">
        <Loader2 size={32} className="animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Portal
          </h2>
          <p className="text-sm text-zinc-500 mt-1">
            Manage sites and control which features appear in the customer widget
          </p>
        </div>
        {!showCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors"
          >
            + Add Site
          </button>
        )}
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="border border-teal-200 dark:border-teal-800 rounded-lg p-5 bg-teal-50/50 dark:bg-teal-900/10">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
            New Site
          </h3>
          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_160px] gap-3">
              <div>
                <label className="block text-[10px] font-medium text-zinc-500 mb-1 uppercase tracking-wide">Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="My Company"
                  className="w-full px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-zinc-500 mb-1 uppercase tracking-wide">Slug</label>
                <input
                  type="text"
                  value={newSlug}
                  onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  placeholder="my-company"
                  className="w-full px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-mono"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-zinc-500 mb-1 uppercase tracking-wide">Base URL</label>
              <input
                type="url"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://example.com (optional)"
                className="w-full px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-mono"
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleCreate}
                disabled={createSite.isPending || !newName.trim() || !newSlug.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-500 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {createSite.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Create
              </button>
              <button
                onClick={() => { setShowCreate(false); setNewName(""); setNewSlug(""); setNewUrl(""); }}
                className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sites list */}
      {(!sites || sites.length === 0) && !showCreate && (
        <div className="text-center py-12 text-zinc-500">
          <Globe size={36} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">No portal sites configured</p>
          <p className="text-xs text-zinc-400 mt-1">Add a site to start embedding the support widget</p>
        </div>
      )}

      {sites && sites.length > 0 && (
        <div className="space-y-2">
          {sites.map((site) => (
            <PortalSiteCard key={site.id} site={site} />
          ))}
        </div>
      )}

      {/* Info box at bottom */}
      {sites && sites.length > 0 && (
        <div className="p-3.5 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-lg">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Each site gets its own widget via <code className="text-[11px] bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded">?site=slug</code>.
            Feature toggles are master switches — when off, the feature won't appear in the widget regardless of content targeting.
          </p>
        </div>
      )}
    </div>
  );
}
