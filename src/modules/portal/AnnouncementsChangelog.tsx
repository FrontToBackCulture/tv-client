// AnnouncementsView: Changelog list and detail

import { useState, useEffect } from "react";
import { Sparkles, Plus } from "lucide-react";
import { Button } from "../../components/ui";
import {
  useChangelog,
  useCreateChangelog,
  useUpdateChangelog,
  useDeleteChangelog,
} from "../../hooks/portal";
import { cn } from "../../lib/cn";
import {
  DetailHeader,
  ToggleSwitch,
  SiteTargeting,
} from "./announcementsShared";
import { FormField, Input, Select, Textarea } from "../../components/ui";
import { StatusChip } from "../product/StatusChip";

const CATEGORY_COLORS: Record<string, string> = {
  feature: "teal",
  improvement: "blue",
  fix: "red",
  announcement: "purple",
};

export function ChangelogList({
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
        <Button
          variant="ghost"
          icon={Plus}
          onClick={handleCreate}
          loading={createEntry.isPending}
          className="text-xs text-teal-600 dark:text-teal-400"
        >
          Add
        </Button>
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
              "w-full text-left px-3 py-3 border-b border-zinc-100 dark:border-zinc-800/50 transition-colors",
              "hover:bg-zinc-50 dark:hover:bg-zinc-900/50",
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
                <div className="text-xs text-zinc-400 mt-0.5">
                  {entry.published_at
                    ? new Date(entry.published_at).toLocaleDateString()
                    : "Draft"}
                </div>
              </div>
              <StatusChip label={entry.category} color={CATEGORY_COLORS[entry.category] || "teal"} />
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

export function ChangelogDetail({
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
        <FormField label="Title">
          <Input
            type="text"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </FormField>

        <FormField label="Body">
          <Textarea
            value={form.body}
            onChange={(e) => set("body", e.target.value)}
            rows={8}
            className="resize-none"
          />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Category">
            <Select
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
            >
              <option value="feature">Feature</option>
              <option value="improvement">Improvement</option>
              <option value="fix">Fix</option>
              <option value="announcement">Announcement</option>
            </Select>
          </FormField>

          <FormField label="Published">
            <ToggleSwitch
              value={form.is_published}
              onChange={(v) => set("is_published", v)}
            />
          </FormField>
        </div>

        <FormField label="Target Sites">
          <SiteTargeting
            value={form.target_sites}
            onChange={(sites) => set("target_sites", sites)}
          />
        </FormField>
      </div>
    </div>
  );
}
