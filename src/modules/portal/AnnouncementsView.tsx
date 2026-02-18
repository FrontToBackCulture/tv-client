// src/modules/portal/AnnouncementsView.tsx

import { useState, useEffect } from "react";
import {
  Flag,
  Sparkles,
  MessageCircle,
  Plus,
  X,
  Trash2,
  Save,
  ChevronDown,
} from "lucide-react";
import {
  useBanners,
  useCreateBanner,
  useUpdateBanner,
  useDeleteBanner,
  usePopups,
  useCreatePopup,
  useUpdatePopup,
  useDeletePopup,
  useChangelog,
  useCreateChangelog,
  useUpdateChangelog,
  useDeleteChangelog,
  usePortalSites,
} from "../../hooks/usePortal";
import { cn } from "../../lib/cn";
import type { AnnouncementTab } from "../../lib/portal/types";

interface AnnouncementsViewProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  detailWidth: number;
  onResizeStart: (e: React.MouseEvent) => void;
}

export function AnnouncementsView({
  selectedId,
  onSelect,
  detailWidth,
  onResizeStart,
}: AnnouncementsViewProps) {
  const [tab, setTab] = useState<AnnouncementTab>("banners");

  return (
    <>
      {/* List panel */}
      <div
        className="flex flex-col border-r border-slate-200 dark:border-zinc-800 overflow-hidden"
        style={{
          flex: selectedId ? `0 0 ${100 - detailWidth}%` : "1 1 auto",
        }}
      >
        {/* Sub-tab bar */}
        <div className="flex-shrink-0 border-b border-slate-200 dark:border-zinc-800">
          <div className="flex items-center px-2">
            {(
              [
                { key: "banners", label: "Banners", icon: Flag },
                { key: "popups", label: "Popups", icon: MessageCircle },
                { key: "changelog", label: "Changelog", icon: Sparkles },
              ] as const
            ).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => {
                  setTab(key);
                  onSelect(null);
                }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2",
                  tab === key
                    ? "border-teal-500 text-zinc-800 dark:text-zinc-100"
                    : "border-transparent text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-400"
                )}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        {tab === "banners" && (
          <BannersList selectedId={selectedId} onSelect={onSelect} />
        )}
        {tab === "changelog" && (
          <ChangelogList selectedId={selectedId} onSelect={onSelect} />
        )}
        {tab === "popups" && (
          <PopupsList selectedId={selectedId} onSelect={onSelect} />
        )}
      </div>

      {/* Detail panel */}
      {selectedId && (
        <div
          className="relative flex flex-col overflow-hidden"
          style={{ flex: `0 0 ${detailWidth}%` }}
        >
          <div
            onMouseDown={onResizeStart}
            className="absolute top-0 -left-1 w-3 h-full cursor-col-resize z-10 group"
          >
            <div className="w-0.5 h-full mx-auto bg-transparent group-hover:bg-teal-500/60 transition-colors" />
          </div>

          {tab === "banners" && (
            <BannerDetail id={selectedId} onClose={() => onSelect(null)} />
          )}
          {tab === "changelog" && (
            <ChangelogDetail id={selectedId} onClose={() => onSelect(null)} />
          )}
          {tab === "popups" && (
            <PopupDetail id={selectedId} onClose={() => onSelect(null)} />
          )}
        </div>
      )}
    </>
  );
}

// ── Site targeting multi-select ──

function SiteTargeting({
  value,
  onChange,
}: {
  value: string[];
  onChange: (sites: string[]) => void;
}) {
  const { data: sites } = usePortalSites();
  const [open, setOpen] = useState(false);

  if (!sites?.length) return null;

  const toggleSite = (siteId: string) => {
    if (value.includes(siteId)) {
      onChange(value.filter((s) => s !== siteId));
    } else {
      onChange([...value, siteId]);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-xs border border-slate-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
      >
        <span>
          {value.length === 0
            ? "All sites"
            : value
                .map((id) => sites.find((s) => s.id === id)?.name || id)
                .join(", ")}
        </span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-md shadow-lg">
          <button
            onClick={() => {
              onChange([]);
              setOpen(false);
            }}
            className={cn(
              "w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-zinc-700",
              value.length === 0 && "text-teal-600 font-medium"
            )}
          >
            All sites (default)
          </button>
          {sites.map((site) => (
            <button
              key={site.id}
              onClick={() => toggleSite(site.id)}
              className={cn(
                "w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-zinc-700 flex items-center gap-2",
                value.includes(site.id) && "text-teal-600 font-medium"
              )}
            >
              <span
                className={cn(
                  "w-3 h-3 border rounded-sm flex items-center justify-center",
                  value.includes(site.id)
                    ? "border-teal-500 bg-teal-500"
                    : "border-zinc-300 dark:border-zinc-600"
                )}
              >
                {value.includes(site.id) && (
                  <span className="text-white text-[8px]">&#10003;</span>
                )}
              </span>
              {site.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Banners ──

function BannersList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { data: banners, isLoading } = useBanners();
  const createBanner = useCreateBanner();

  const handleCreate = async () => {
    try {
      const result = await createBanner.mutateAsync({
        title: "New Banner",
        content: "",
        type: "info",
        dismissible: true,
        is_active: false,
        target_sites: [],
      });
      onSelect(result.id);
    } catch (err) {
      console.error("[portal] Failed to create banner:", err);
    }
  };

  return (
    <>
      <div className="flex-shrink-0 px-3 py-2 flex items-center justify-between">
        <span className="text-xs text-zinc-400">
          {banners?.length ?? 0} banner{(banners?.length ?? 0) !== 1 ? "s" : ""}
        </span>
        <button
          onClick={handleCreate}
          disabled={createBanner.isPending}
          className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-500/10 rounded transition-colors"
        >
          <Plus size={12} />
          Add
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center p-8">
            <div className="w-5 h-5 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!isLoading && (!banners || banners.length === 0) && (
          <div className="flex flex-col items-center justify-center p-6 text-center mt-8">
            <Flag size={40} className="text-zinc-300 dark:text-zinc-700 mb-3" />
            <p className="text-sm text-zinc-500">No banners</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-1">
              Create a banner to display on customer sites
            </p>
          </div>
        )}

        {banners?.map((banner) => (
          <button
            key={banner.id}
            onClick={() => onSelect(banner.id)}
            className={cn(
              "w-full text-left px-3 py-3 border-b border-slate-100 dark:border-zinc-800/50 transition-colors",
              "hover:bg-slate-50 dark:hover:bg-zinc-900/50",
              selectedId === banner.id &&
                "bg-teal-50 dark:bg-teal-500/10 border-l-2 border-l-teal-500"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                    {banner.title || "Untitled"}
                  </span>
                  <span
                    className={cn(
                      "w-2 h-2 rounded-full flex-shrink-0",
                      banner.is_active ? "bg-green-500" : "bg-zinc-300"
                    )}
                  />
                </div>
                <div className="text-[11px] text-zinc-400 truncate mt-0.5">
                  {banner.type} &middot; {banner.content || "No content"}
                </div>
              </div>
              <TypeBadge type={banner.type} />
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

function BannerDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: banners } = useBanners();
  const updateBanner = useUpdateBanner();
  const deleteBanner = useDeleteBanner();
  const banner = banners?.find((b) => b.id === id);

  // Local form state
  const [form, setForm] = useState({
    title: "",
    content: "",
    type: "info" as string,
    bg_color: "",
    text_color: "",
    cta_text: "",
    cta_url: "",
    dismissible: true,
    auto_dismiss_seconds: null as number | null,
    is_active: false,
    starts_at: "",
    ends_at: "",
    target_sites: [] as string[],
  });
  const [dirty, setDirty] = useState(false);

  // Sync from server data when banner changes
  useEffect(() => {
    if (!banner) return;
    setForm({
      title: banner.title,
      content: banner.content,
      type: banner.type,
      bg_color: banner.bg_color || "",
      text_color: banner.text_color || "",
      cta_text: banner.cta_text || "",
      cta_url: banner.cta_url || "",
      dismissible: banner.dismissible,
      auto_dismiss_seconds: banner.auto_dismiss_seconds,
      is_active: banner.is_active,
      starts_at: banner.starts_at?.slice(0, 16) || "",
      ends_at: banner.ends_at?.slice(0, 16) || "",
      target_sites: banner.target_sites,
    });
    setDirty(false);
  }, [banner]);

  if (!banner) return null;

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    try {
      await updateBanner.mutateAsync({
        id,
        title: form.title,
        content: form.content,
        type: form.type as "info" | "warning" | "maintenance" | "announcement",
        bg_color: form.bg_color || null,
        text_color: form.text_color || null,
        cta_text: form.cta_text || null,
        cta_url: form.cta_url || null,
        dismissible: form.dismissible,
        auto_dismiss_seconds: form.auto_dismiss_seconds,
        is_active: form.is_active,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
        target_sites: form.target_sites,
      });
      setDirty(false);
    } catch (err) {
      console.error("[portal] Failed to update banner:", err);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteBanner.mutateAsync(id);
      onClose();
    } catch (err) {
      console.error("[portal] Failed to delete banner:", err);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <DetailHeader
        title="Edit Banner"
        dirty={dirty}
        saving={updateBanner.isPending}
        onSave={handleSave}
        onDelete={handleDelete}
        onClose={onClose}
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <Field label="Title">
          <input
            type="text"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Content">
          <textarea
            value={form.content}
            onChange={(e) => set("content", e.target.value)}
            rows={3}
            className={inputClass + " resize-none"}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <select
              value={form.type}
              onChange={(e) => set("type", e.target.value)}
              className={inputClass}
            >
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="maintenance">Maintenance</option>
              <option value="announcement">Announcement</option>
            </select>
          </Field>

          <Field label="Active">
            <ToggleSwitch
              value={form.is_active}
              onChange={(v) => set("is_active", v)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Background Color">
            <div className="flex gap-2">
              <input
                type="color"
                value={form.bg_color || "#1E3A5F"}
                onChange={(e) => set("bg_color", e.target.value)}
                className="w-8 h-8 rounded border border-slate-200 dark:border-zinc-700 cursor-pointer"
              />
              <input
                type="text"
                value={form.bg_color}
                onChange={(e) => set("bg_color", e.target.value)}
                placeholder="#1E3A5F"
                className="flex-1 px-2 py-1 text-xs border border-slate-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
              />
            </div>
          </Field>

          <Field label="Text Color">
            <div className="flex gap-2">
              <input
                type="color"
                value={form.text_color || "#ffffff"}
                onChange={(e) => set("text_color", e.target.value)}
                className="w-8 h-8 rounded border border-slate-200 dark:border-zinc-700 cursor-pointer"
              />
              <input
                type="text"
                value={form.text_color}
                onChange={(e) => set("text_color", e.target.value)}
                placeholder="#ffffff"
                className="flex-1 px-2 py-1 text-xs border border-slate-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
              />
            </div>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="CTA Text">
            <input
              type="text"
              value={form.cta_text}
              onChange={(e) => set("cta_text", e.target.value)}
              placeholder="Learn more"
              className={inputClass}
            />
          </Field>

          <Field label="CTA URL">
            <input
              type="text"
              value={form.cta_url}
              onChange={(e) => set("cta_url", e.target.value)}
              placeholder="https://..."
              className={inputClass}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Dismissible">
            <ToggleSwitch
              value={form.dismissible}
              onChange={(v) => set("dismissible", v)}
            />
          </Field>

          <Field label="Auto-dismiss (seconds)">
            <input
              type="number"
              value={form.auto_dismiss_seconds ?? ""}
              onChange={(e) =>
                set("auto_dismiss_seconds", e.target.value ? parseInt(e.target.value) : null)
              }
              placeholder="None"
              className={inputClass}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts at">
            <input
              type="datetime-local"
              value={form.starts_at}
              onChange={(e) => set("starts_at", e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="Ends at">
            <input
              type="datetime-local"
              value={form.ends_at}
              onChange={(e) => set("ends_at", e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="Target Sites">
          <SiteTargeting
            value={form.target_sites}
            onChange={(sites) => set("target_sites", sites)}
          />
        </Field>

        {/* Preview */}
        <Field label="Preview">
          <div
            className="rounded-lg px-4 py-2.5 flex items-center justify-center gap-3 text-sm"
            style={{
              background: form.bg_color || "#1E3A5F",
              color: form.text_color || "#ffffff",
            }}
          >
            <span>{form.content || "Banner content..."}</span>
            {form.cta_text && (
              <span className="font-semibold underline">{form.cta_text}</span>
            )}
            {form.dismissible && (
              <span className="opacity-70">&#215;</span>
            )}
          </div>
        </Field>
      </div>
    </div>
  );
}

// ── Changelog ──

function ChangelogList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { data: entries, isLoading } = useChangelog();
  const createEntry = useCreateChangelog();

  const handleCreate = async () => {
    try {
      const result = await createEntry.mutateAsync({
        title: "New Entry",
        body: "",
        category: "feature",
        is_published: false,
        target_sites: [],
      });
      onSelect(result.id);
    } catch (err) {
      console.error("[portal] Failed to create changelog entry:", err);
    }
  };

  return (
    <>
      <div className="flex-shrink-0 px-3 py-2 flex items-center justify-between">
        <span className="text-xs text-zinc-400">
          {entries?.length ?? 0} entr{(entries?.length ?? 0) !== 1 ? "ies" : "y"}
        </span>
        <button
          onClick={handleCreate}
          disabled={createEntry.isPending}
          className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-500/10 rounded transition-colors"
        >
          <Plus size={12} />
          Add
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center p-8">
            <div className="w-5 h-5 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!isLoading && (!entries || entries.length === 0) && (
          <div className="flex flex-col items-center justify-center p-6 text-center mt-8">
            <Sparkles
              size={40}
              className="text-zinc-300 dark:text-zinc-700 mb-3"
            />
            <p className="text-sm text-zinc-500">No changelog entries</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-1">
              Document product updates for your customers
            </p>
          </div>
        )}

        {entries?.map((entry) => (
          <button
            key={entry.id}
            onClick={() => onSelect(entry.id)}
            className={cn(
              "w-full text-left px-3 py-3 border-b border-slate-100 dark:border-zinc-800/50 transition-colors",
              "hover:bg-slate-50 dark:hover:bg-zinc-900/50",
              selectedId === entry.id &&
                "bg-teal-50 dark:bg-teal-500/10 border-l-2 border-l-teal-500"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                    {entry.title || "Untitled"}
                  </span>
                  <span
                    className={cn(
                      "w-2 h-2 rounded-full flex-shrink-0",
                      entry.is_published ? "bg-green-500" : "bg-zinc-300"
                    )}
                  />
                </div>
                <div className="text-[11px] text-zinc-400 mt-0.5">
                  {entry.published_at
                    ? new Date(entry.published_at).toLocaleDateString()
                    : "Draft"}
                </div>
              </div>
              <CategoryBadge category={entry.category} />
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

function ChangelogDetail({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const { data: entries } = useChangelog();
  const updateEntry = useUpdateChangelog();
  const deleteEntry = useDeleteChangelog();
  const entry = entries?.find((e) => e.id === id);

  const [form, setForm] = useState({
    title: "",
    body: "",
    category: "feature" as string,
    is_published: false,
    target_sites: [] as string[],
  });
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!entry) return;
    setForm({
      title: entry.title,
      body: entry.body,
      category: entry.category,
      is_published: entry.is_published,
      target_sites: entry.target_sites,
    });
    setDirty(false);
  }, [entry]);

  if (!entry) return null;

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    try {
      await updateEntry.mutateAsync({
        id,
        title: form.title,
        body: form.body,
        category: form.category as "feature" | "improvement" | "fix" | "announcement",
        is_published: form.is_published,
        target_sites: form.target_sites,
      });
      setDirty(false);
    } catch (err) {
      console.error("[portal] Failed to update changelog:", err);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteEntry.mutateAsync(id);
      onClose();
    } catch (err) {
      console.error("[portal] Failed to delete changelog:", err);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <DetailHeader
        title="Edit Entry"
        dirty={dirty}
        saving={updateEntry.isPending}
        onSave={handleSave}
        onDelete={handleDelete}
        onClose={onClose}
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <Field label="Title">
          <input
            type="text"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Body">
          <textarea
            value={form.body}
            onChange={(e) => set("body", e.target.value)}
            rows={8}
            className={inputClass + " resize-none"}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <select
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              className={inputClass}
            >
              <option value="feature">Feature</option>
              <option value="improvement">Improvement</option>
              <option value="fix">Fix</option>
              <option value="announcement">Announcement</option>
            </select>
          </Field>

          <Field label="Published">
            <ToggleSwitch
              value={form.is_published}
              onChange={(v) => set("is_published", v)}
            />
          </Field>
        </div>

        <Field label="Target Sites">
          <SiteTargeting
            value={form.target_sites}
            onChange={(sites) => set("target_sites", sites)}
          />
        </Field>
      </div>
    </div>
  );
}

// ── Popups ──

function PopupsList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { data: popups, isLoading } = usePopups();
  const createPopup = useCreatePopup();

  const handleCreate = async () => {
    try {
      const result = await createPopup.mutateAsync({
        title: "New Popup",
        body: "",
        trigger_type: "page_load",
        frequency: "once",
        is_active: false,
        target_sites: [],
      });
      onSelect(result.id);
    } catch (err) {
      console.error("[portal] Failed to create popup:", err);
    }
  };

  return (
    <>
      <div className="flex-shrink-0 px-3 py-2 flex items-center justify-between">
        <span className="text-xs text-zinc-400">
          {popups?.length ?? 0} popup{(popups?.length ?? 0) !== 1 ? "s" : ""}
        </span>
        <button
          onClick={handleCreate}
          disabled={createPopup.isPending}
          className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-500/10 rounded transition-colors"
        >
          <Plus size={12} />
          Add
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center p-8">
            <div className="w-5 h-5 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!isLoading && (!popups || popups.length === 0) && (
          <div className="flex flex-col items-center justify-center p-6 text-center mt-8">
            <MessageCircle
              size={40}
              className="text-zinc-300 dark:text-zinc-700 mb-3"
            />
            <p className="text-sm text-zinc-500">No popups</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-1">
              Create popups to engage customers on your site
            </p>
          </div>
        )}

        {popups?.map((popup) => (
          <button
            key={popup.id}
            onClick={() => onSelect(popup.id)}
            className={cn(
              "w-full text-left px-3 py-3 border-b border-slate-100 dark:border-zinc-800/50 transition-colors",
              "hover:bg-slate-50 dark:hover:bg-zinc-900/50",
              selectedId === popup.id &&
                "bg-teal-50 dark:bg-teal-500/10 border-l-2 border-l-teal-500"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                    {popup.title || "Untitled"}
                  </span>
                  <span
                    className={cn(
                      "w-2 h-2 rounded-full flex-shrink-0",
                      popup.is_active ? "bg-green-500" : "bg-zinc-300"
                    )}
                  />
                </div>
                <div className="text-[11px] text-zinc-400 mt-0.5">
                  {popup.trigger_type} &middot; {popup.frequency}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

function PopupDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: popups } = usePopups();
  const updatePopup = useUpdatePopup();
  const deletePopup = useDeletePopup();
  const popup = popups?.find((p) => p.id === id);

  const [form, setForm] = useState({
    title: "",
    body: "",
    image_url: "",
    cta_text: "",
    cta_url: "",
    trigger_type: "page_load" as string,
    trigger_value: "",
    frequency: "once" as string,
    frequency_days: null as number | null,
    url_pattern: "",
    is_active: false,
    target_sites: [] as string[],
  });
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!popup) return;
    setForm({
      title: popup.title,
      body: popup.body,
      image_url: popup.image_url || "",
      cta_text: popup.cta_text || "",
      cta_url: popup.cta_url || "",
      trigger_type: popup.trigger_type,
      trigger_value: popup.trigger_value || "",
      frequency: popup.frequency,
      frequency_days: popup.frequency_days,
      url_pattern: popup.url_pattern || "",
      is_active: popup.is_active,
      target_sites: popup.target_sites,
    });
    setDirty(false);
  }, [popup]);

  if (!popup) return null;

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    try {
      await updatePopup.mutateAsync({
        id,
        title: form.title,
        body: form.body,
        image_url: form.image_url || null,
        cta_text: form.cta_text || null,
        cta_url: form.cta_url || null,
        trigger_type: form.trigger_type as "page_load" | "delay" | "scroll_percent",
        trigger_value: form.trigger_value || null,
        frequency: form.frequency as "once" | "every_session" | "every_x_days",
        frequency_days: form.frequency_days,
        url_pattern: form.url_pattern || null,
        is_active: form.is_active,
        target_sites: form.target_sites,
      });
      setDirty(false);
    } catch (err) {
      console.error("[portal] Failed to update popup:", err);
    }
  };

  const handleDelete = async () => {
    try {
      await deletePopup.mutateAsync(id);
      onClose();
    } catch (err) {
      console.error("[portal] Failed to delete popup:", err);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <DetailHeader
        title="Edit Popup"
        dirty={dirty}
        saving={updatePopup.isPending}
        onSave={handleSave}
        onDelete={handleDelete}
        onClose={onClose}
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <Field label="Title">
          <input
            type="text"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Body">
          <textarea
            value={form.body}
            onChange={(e) => set("body", e.target.value)}
            rows={5}
            className={inputClass + " resize-none"}
          />
        </Field>

        <Field label="Image URL">
          <input
            type="text"
            value={form.image_url}
            onChange={(e) => set("image_url", e.target.value)}
            placeholder="https://..."
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="CTA Text">
            <input
              type="text"
              value={form.cta_text}
              onChange={(e) => set("cta_text", e.target.value)}
              placeholder="Learn more"
              className={inputClass}
            />
          </Field>

          <Field label="CTA URL">
            <input
              type="text"
              value={form.cta_url}
              onChange={(e) => set("cta_url", e.target.value)}
              placeholder="https://..."
              className={inputClass}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Trigger">
            <select
              value={form.trigger_type}
              onChange={(e) => set("trigger_type", e.target.value)}
              className={inputClass}
            >
              <option value="page_load">Page Load</option>
              <option value="delay">Delay</option>
              <option value="scroll_percent">Scroll %</option>
            </select>
          </Field>

          {form.trigger_type !== "page_load" && (
            <Field
              label={
                form.trigger_type === "delay"
                  ? "Delay (seconds)"
                  : "Scroll %"
              }
            >
              <input
                type="number"
                value={form.trigger_value}
                onChange={(e) => set("trigger_value", e.target.value)}
                placeholder={form.trigger_type === "delay" ? "5" : "50"}
                className={inputClass}
              />
            </Field>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Frequency">
            <select
              value={form.frequency}
              onChange={(e) => set("frequency", e.target.value)}
              className={inputClass}
            >
              <option value="once">Once</option>
              <option value="every_session">Every Session</option>
              <option value="every_x_days">Every X Days</option>
            </select>
          </Field>

          {form.frequency === "every_x_days" && (
            <Field label="Days">
              <input
                type="number"
                value={form.frequency_days ?? ""}
                onChange={(e) =>
                  set("frequency_days", e.target.value ? parseInt(e.target.value) : null)
                }
                placeholder="7"
                className={inputClass}
              />
            </Field>
          )}
        </div>

        <Field label="URL Pattern">
          <input
            type="text"
            value={form.url_pattern}
            onChange={(e) => set("url_pattern", e.target.value)}
            placeholder="*/pricing* (optional)"
            className={inputClass}
          />
        </Field>

        <Field label="Active">
          <ToggleSwitch
            value={form.is_active}
            onChange={(v) => set("is_active", v)}
          />
        </Field>

        <Field label="Target Sites">
          <SiteTargeting
            value={form.target_sites}
            onChange={(sites) => set("target_sites", sites)}
          />
        </Field>
      </div>
    </div>
  );
}

// ── Shared Components ──

const inputClass =
  "w-full px-3 py-1.5 text-sm border border-slate-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500";

function DetailHeader({
  title,
  dirty,
  saving,
  onSave,
  onDelete,
  onClose,
}: {
  title: string;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-zinc-800">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {title}
        </span>
        {dirty && (
          <span className="text-[10px] text-amber-500 font-medium">
            unsaved
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={onSave}
          disabled={!dirty || saving}
          className={cn(
            "flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded transition-colors",
            dirty
              ? "bg-teal-600 text-white hover:bg-teal-500"
              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed"
          )}
        >
          <Save size={12} />
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          onClick={onDelete}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-50 dark:hover:bg-red-500/10 text-zinc-400 hover:text-red-500"
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-zinc-800 text-zinc-400"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

function ToggleSwitch({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={cn(
        "w-9 h-5 rounded-full transition-colors relative",
        value ? "bg-teal-500" : "bg-zinc-300 dark:bg-zinc-600"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm",
          value ? "translate-x-4.5" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    info: "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
    warning:
      "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
    maintenance:
      "bg-orange-100 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400",
    announcement:
      "bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400",
  };

  return (
    <span
      className={cn(
        "text-[10px] px-1.5 py-0.5 rounded font-medium capitalize",
        colors[type] || colors.info
      )}
    >
      {type}
    </span>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const colors: Record<string, string> = {
    feature:
      "bg-teal-100 text-teal-700 dark:bg-teal-500/10 dark:text-teal-400",
    improvement:
      "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
    fix: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400",
    announcement:
      "bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400",
  };

  return (
    <span
      className={cn(
        "text-[10px] px-1.5 py-0.5 rounded font-medium capitalize",
        colors[category] || colors.feature
      )}
    >
      {category}
    </span>
  );
}
