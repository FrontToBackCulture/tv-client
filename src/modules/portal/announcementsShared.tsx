// AnnouncementsView: Shared form components

import { useState } from "react";
import { X, Trash2, Save, ChevronDown } from "lucide-react";
import { usePortalSites } from "../../hooks/portal";
import { cn } from "../../lib/cn";
import { Button, IconButton } from "../../components/ui";

export function DetailHeader({
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
    <div className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {title}
        </span>
        {dirty && (
          <span className="text-xs text-amber-500 font-medium">
            unsaved
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <Button
          icon={Save}
          onClick={onSave}
          disabled={!dirty || saving}
          loading={saving}
          variant={dirty ? "primary" : "secondary"}
          className="text-xs"
        >
          {saving ? "Saving..." : "Save"}
        </Button>
        <IconButton
          icon={Trash2}
          size={14}
          variant="danger"
          label="Delete"
          onClick={onDelete}
        />
        <IconButton
          icon={X}
          label="Close"
          onClick={onClose}
        />
      </div>
    </div>
  );
}

export function ToggleSwitch({
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

export function SiteTargeting({
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
        className="w-full flex items-center justify-between px-3 py-1.5 text-xs border border-zinc-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
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
        <div className="absolute z-20 mt-1 w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md shadow-lg">
          <button
            onClick={() => {
              onChange([]);
              setOpen(false);
            }}
            className={cn(
              "w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-700",
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
                "w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-700 flex items-center gap-2",
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
                  <span className="text-white text-xs">&#10003;</span>
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
