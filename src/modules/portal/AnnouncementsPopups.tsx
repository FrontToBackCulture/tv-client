// AnnouncementsView: Popups list and detail

import { useState, useEffect } from "react";
import { MessageCircle, Plus } from "lucide-react";
import {
  usePopups,
  useCreatePopup,
  useUpdatePopup,
  useDeletePopup,
} from "../../hooks/portal";
import { cn } from "../../lib/cn";
import {
  inputClass,
  DetailHeader,
  Field,
  ToggleSwitch,
  SiteTargeting,
} from "./announcementsShared";

export function PopupsList({
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
              "w-full text-left px-3 py-3 border-b border-zinc-100 dark:border-zinc-800/50 transition-colors",
              "hover:bg-zinc-50 dark:hover:bg-zinc-900/50",
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

export function PopupDetail({ id, onClose }: { id: string; onClose: () => void }) {
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
