// AnnouncementsView: Banners list and detail

import { useState, useEffect } from "react";
import { Flag, Plus } from "lucide-react";
import {
  useBanners,
  useCreateBanner,
  useUpdateBanner,
  useDeleteBanner,
} from "../../hooks/portal";
import { cn } from "../../lib/cn";
import {
  inputClass,
  DetailHeader,
  Field,
  ToggleSwitch,
  SiteTargeting,
} from "./announcementsShared";
import { StatusChip } from "../product/StatusChip";

const TYPE_COLORS: Record<string, string> = {
  info: "blue",
  warning: "yellow",
  maintenance: "orange",
  announcement: "purple",
};

export function BannersList({
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
              "w-full text-left px-3 py-3 border-b border-zinc-100 dark:border-zinc-800/50 transition-colors",
              "hover:bg-zinc-50 dark:hover:bg-zinc-900/50",
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
              <StatusChip label={banner.type} color={TYPE_COLORS[banner.type] || "blue"} />
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

export function BannerDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: banners } = useBanners();
  const updateBanner = useUpdateBanner();
  const deleteBanner = useDeleteBanner();
  const banner = banners?.find((b) => b.id === id);

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
                className="w-8 h-8 rounded border border-zinc-200 dark:border-zinc-700 cursor-pointer"
              />
              <input
                type="text"
                value={form.bg_color}
                onChange={(e) => set("bg_color", e.target.value)}
                placeholder="#1E3A5F"
                className="flex-1 px-2 py-1 text-xs border border-zinc-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
              />
            </div>
          </Field>

          <Field label="Text Color">
            <div className="flex gap-2">
              <input
                type="color"
                value={form.text_color || "#ffffff"}
                onChange={(e) => set("text_color", e.target.value)}
                className="w-8 h-8 rounded border border-zinc-200 dark:border-zinc-700 cursor-pointer"
              />
              <input
                type="text"
                value={form.text_color}
                onChange={(e) => set("text_color", e.target.value)}
                placeholder="#ffffff"
                className="flex-1 px-2 py-1 text-xs border border-zinc-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
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
