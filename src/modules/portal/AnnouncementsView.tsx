// src/modules/portal/AnnouncementsView.tsx

import { useState } from "react";
import { Flag, Sparkles, MessageCircle } from "lucide-react";
import { cn } from "../../lib/cn";
import type { AnnouncementTab } from "../../lib/portal/types";
import { BannersList, BannerDetail } from "./AnnouncementsBanners";
import { ChangelogList, ChangelogDetail } from "./AnnouncementsChangelog";
import { PopupsList, PopupDetail } from "./AnnouncementsPopups";

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
        className="flex flex-col border-r border-zinc-200 dark:border-zinc-800 overflow-hidden"
        style={{
          flex: selectedId ? `0 0 ${100 - detailWidth}%` : "1 1 auto",
        }}
      >
        {/* Sub-tab bar */}
        <div className="flex-shrink-0 border-b border-zinc-200 dark:border-zinc-800">
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
