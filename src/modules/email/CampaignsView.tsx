// src/modules/email/CampaignsView.tsx
// Campaign list with tree sidebar for grouping + inline category picker + actions

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Plus, Pencil, Copy, Trash2, Tag, Check, X } from "lucide-react";
import { useEmailCampaigns, useDeleteEmailCampaign, useCloneEmailCampaign, useUpdateEmailCampaign } from "../../hooks/email";
import { CAMPAIGN_STATUSES } from "../../lib/email/types";
import type { EmailCampaignWithStats } from "../../lib/email/types";
import { formatDate } from "../../lib/date";
import { cn } from "../../lib/cn";
import { EmailTreeSidebar, type GroupByOption, type TreeSelection } from "./EmailTreeSidebar";

// ─── Grouping options ─────────────────────────────────────────────────────────

const STATUS_ORDER: string[] = CAMPAIGN_STATUSES.map((s) => s.value);

const campaignGroupByOptions: GroupByOption<EmailCampaignWithStats>[] = [
  {
    key: "category",
    label: "Category",
    getGroup: (c) => c.category || "(uncategorized)",
  },
  {
    key: "status",
    label: "Status",
    getGroup: (c) => c.status,
    getLabel: (v) => CAMPAIGN_STATUSES.find((s) => s.value === v)?.label ?? v,
    sortGroups: (a, b) => STATUS_ORDER.indexOf(a) - STATUS_ORDER.indexOf(b),
  },
  {
    key: "group",
    label: "Recipient Group",
    getGroup: (c) => c.group?.name ?? "(no group)",
  },
  {
    key: "month",
    label: "Month",
    getGroup: (c) => {
      const d = c.sent_at || c.created_at;
      return d ? d.slice(0, 7) : "unknown"; // YYYY-MM
    },
    getLabel: (v) => {
      if (v === "unknown") return "Unknown";
      const [y, m] = v.split("-");
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return `${months[parseInt(m, 10) - 1]} ${y}`;
    },
    sortGroups: (a, b) => b.localeCompare(a), // newest first
  },
];

// ─── View ─────────────────────────────────────────────────────────────────────

interface CampaignsViewProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onNewCampaign: () => void;
}

export function CampaignsView({ selectedId, onSelect, onNewCampaign }: CampaignsViewProps) {
  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState("category");
  const [treeSelection, setTreeSelection] = useState<TreeSelection>({ groupValue: null });

  const { data: campaigns = [], isLoading } = useEmailCampaigns({
    search: search || undefined,
  });
  const deleteCampaign = useDeleteEmailCampaign();
  const cloneCampaign = useCloneEmailCampaign();
  const updateCampaign = useUpdateEmailCampaign();
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Collect existing categories for the inline picker
  const existingCategories = useMemo(() => {
    const set = new Set<string>();
    for (const c of campaigns) {
      if (c.category) set.add(c.category);
    }
    return Array.from(set).sort();
  }, [campaigns]);

  // Filter by tree selection
  const activeOption = campaignGroupByOptions.find((o) => o.key === groupBy) ?? campaignGroupByOptions[0];
  const filtered = useMemo(() => {
    if (!treeSelection.groupValue) return campaigns;
    return campaigns.filter((c) => {
      const val = activeOption.getGroup(c);
      const keys = Array.isArray(val) ? val : [val];
      return keys.includes(treeSelection.groupValue!);
    });
  }, [campaigns, treeSelection.groupValue, activeOption]);

  const handleDelete = async (id: string) => {
    await deleteCampaign.mutateAsync(id);
    if (selectedId === id) onSelect(null);
    setDeleteConfirmId(null);
  };

  const handleClone = async (id: string) => {
    const cloned = await cloneCampaign.mutateAsync(id);
    onSelect(cloned.id);
  };

  const handleCategoryChange = useCallback((campaignId: string, category: string | null) => {
    updateCampaign.mutate({ id: campaignId, updates: { category } });
  }, [updateCampaign]);

  return (
    <div className="h-full flex">
      <EmailTreeSidebar
        items={campaigns}
        groupByOptions={campaignGroupByOptions}
        activeGroupBy={groupBy}
        onGroupByChange={setGroupBy}
        selection={treeSelection}
        onSelectionChange={setTreeSelection}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search campaigns..."
        title="Campaigns"
        totalCount={campaigns.length}
      />

      {/* List */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800/50">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {filtered.length}{treeSelection.groupValue ? ` in ${activeOption.getLabel?.(treeSelection.groupValue) ?? treeSelection.groupValue}` : ""} campaign{filtered.length !== 1 ? "s" : ""}
          </p>
          <button
            onClick={onNewCampaign}
            className="p-1.5 bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 rounded-md hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors"
          >
            <Plus size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-xs text-zinc-400">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-xs text-zinc-400">
              {search ? "No campaigns found" : "No campaigns yet. Create one to get started."}
            </div>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
              {filtered.map((campaign) => (
                <CampaignRow
                  key={campaign.id}
                  campaign={campaign}
                  categories={existingCategories}
                  isSelected={campaign.id === selectedId}
                  isDeleteConfirm={campaign.id === deleteConfirmId}
                  onClick={() => onSelect(campaign.id === selectedId ? null : campaign.id)}
                  onEdit={() => onSelect(campaign.id)}
                  onClone={() => handleClone(campaign.id)}
                  onDeleteClick={() => setDeleteConfirmId(campaign.id)}
                  onDeleteConfirm={() => handleDelete(campaign.id)}
                  onDeleteCancel={() => setDeleteConfirmId(null)}
                  onCategoryChange={(cat) => handleCategoryChange(campaign.id, cat)}
                  isDeleting={deleteCampaign.isPending}
                  isCloning={cloneCampaign.isPending}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function CampaignRow({
  campaign,
  categories,
  isSelected,
  isDeleteConfirm,
  onClick,
  onEdit,
  onClone,
  onDeleteClick,
  onDeleteConfirm,
  onDeleteCancel,
  onCategoryChange,
  isDeleting,
  isCloning,
}: {
  campaign: EmailCampaignWithStats;
  categories: string[];
  isSelected: boolean;
  isDeleteConfirm: boolean;
  onClick: () => void;
  onEdit: () => void;
  onClone: () => void;
  onDeleteClick: () => void;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
  onCategoryChange: (category: string | null) => void;
  isDeleting: boolean;
  isCloning: boolean;
}) {
  const statusDef = CAMPAIGN_STATUSES.find((s) => s.value === campaign.status);
  const statusColors: Record<string, string> = {
    gray: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
    blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    yellow: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    green: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    orange: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    red: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };

  if (isDeleteConfirm) {
    return (
      <div className="px-4 py-3 bg-red-50 dark:bg-red-950/30">
        <p className="text-xs text-red-700 dark:text-red-400 mb-2">
          Delete <strong>{campaign.name}</strong>?
        </p>
        <div className="flex gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onDeleteConfirm(); }}
            disabled={isDeleting}
            className="px-2.5 py-1 text-[11px] font-medium bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDeleteCancel(); }}
            className="px-2.5 py-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`group/row w-full text-left px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors cursor-pointer ${
        isSelected ? "bg-zinc-50 dark:bg-zinc-900/50" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium text-zinc-800 dark:text-zinc-100 truncate">
              {campaign.name}
            </p>
            <InlineCategoryPicker
              value={campaign.category}
              categories={categories}
              onChange={onCategoryChange}
            />
          </div>
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5">
            {campaign.subject}
            {campaign.group && ` · ${campaign.group.name}`}
          </p>
        </div>
        <div className="flex-shrink-0 flex items-center gap-2">
          {/* Action icons — visible on hover */}
          <div className="hidden group-hover/row:flex items-center gap-0.5">
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded transition-colors"
              title="Edit"
            >
              <Pencil size={12} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onClone(); }}
              disabled={isCloning}
              className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded transition-colors disabled:opacity-50"
              title="Clone"
            >
              <Copy size={12} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDeleteClick(); }}
              className="p-1 text-zinc-400 hover:text-red-500 dark:hover:text-red-400 rounded transition-colors"
              title="Delete"
            >
              <Trash2 size={12} />
            </button>
          </div>
          {statusDef && (
            <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${statusColors[statusDef.color] || statusColors.gray}`}>
              {statusDef.label}
            </span>
          )}
          <span className="text-[10px] text-zinc-400">
            {formatDate(campaign.sent_at || campaign.created_at)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Inline Category Picker ───────────────────────────────────────────────────
// Click the chip → dropdown with existing categories + "New..." option.

function InlineCategoryPicker({
  value,
  categories,
  onChange,
}: {
  value: string | null;
  categories: string[];
  onChange: (category: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newValue, setNewValue] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setAdding(false);
        setNewValue("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Focus input when adding
  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const handleSelect = (cat: string | null) => {
    onChange(cat);
    setOpen(false);
    setAdding(false);
    setNewValue("");
  };

  const handleNewSubmit = () => {
    const trimmed = newValue.trim();
    if (trimmed) {
      onChange(trimmed);
    }
    setOpen(false);
    setAdding(false);
    setNewValue("");
  };

  return (
    <div ref={containerRef} className="relative flex-shrink-0">
      {/* Chip */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
          setAdding(false);
          setNewValue("");
        }}
        className={cn(
          "flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-medium rounded-full border transition-colors",
          value
            ? "bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-400 hover:bg-teal-100 dark:hover:bg-teal-900/40"
            : "bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600 hover:text-zinc-500",
        )}
        title={value ? `Category: ${value}` : "Set category"}
      >
        <Tag size={8} />
        {value || "—"}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute left-0 top-full mt-1 z-20 w-44 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg overflow-hidden"
        >
          {/* Existing categories */}
          <div className="max-h-40 overflow-auto">
            {value && (
              <button
                onClick={() => handleSelect(null)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                <X size={10} />
                Remove category
              </button>
            )}
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => handleSelect(cat)}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-1.5 text-[11px] transition-colors",
                  cat === value
                    ? "bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 font-medium"
                    : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800",
                )}
              >
                <span className="truncate">{cat}</span>
                {cat === value && <Check size={10} className="flex-shrink-0" />}
              </button>
            ))}
          </div>

          {/* New category input */}
          <div className="border-t border-zinc-100 dark:border-zinc-800">
            {adding ? (
              <div className="flex items-center gap-1 p-1.5">
                <input
                  ref={inputRef}
                  type="text"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleNewSubmit();
                    if (e.key === "Escape") { setAdding(false); setNewValue(""); }
                  }}
                  placeholder="Category name..."
                  className="flex-1 px-2 py-1 text-[11px] bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
                <button
                  onClick={handleNewSubmit}
                  disabled={!newValue.trim()}
                  className="p-1 text-teal-600 hover:text-teal-700 disabled:text-zinc-300 dark:disabled:text-zinc-600 rounded transition-colors"
                >
                  <Check size={12} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAdding(true)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors"
              >
                <Plus size={10} />
                New category...
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
