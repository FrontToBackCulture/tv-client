// src/modules/portal/ConversationsView.tsx

import { useState } from "react";
import { MessageSquare, Search } from "lucide-react";
import { useConversations, usePortalSites } from "../../hooks/usePortal";
import { ChatPanel } from "./ChatPanel";
import { cn } from "../../lib/cn";
import { timeAgoCompact as timeAgo } from "../../lib/date";
import type { Conversation, ConversationFilters } from "../../lib/portal/types";

interface ConversationsViewProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  detailWidth: number;
  onResizeStart: (e: React.MouseEvent) => void;
}

function statusColor(status: string) {
  switch (status) {
    case "active":
      return "bg-green-500";
    case "waiting":
      return "bg-amber-500";
    case "resolved":
      return "bg-blue-500";
    case "closed":
      return "bg-zinc-400";
    default:
      return "bg-zinc-400";
  }
}

export function ConversationsView({
  selectedId,
  onSelect,
  detailWidth,
  onResizeStart,
}: ConversationsViewProps) {
  const [filters, setFilters] = useState<ConversationFilters>({});
  const [search, setSearch] = useState("");
  const { data: sites } = usePortalSites();
  const { data: conversations, isLoading } = useConversations(filters);

  // Filter by search locally
  const filtered = (conversations ?? []).filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.customer_name?.toLowerCase().includes(q) ||
      c.customer_email?.toLowerCase().includes(q)
    );
  });

  return (
    <>
      {/* List panel */}
      <div
        className="flex flex-col border-r border-slate-200 dark:border-zinc-800 overflow-hidden"
        style={{
          flex: selectedId ? `0 0 ${100 - detailWidth}%` : "1 1 auto",
        }}
      >
        {/* Search + filter bar */}
        <div className="flex-shrink-0 p-3 border-b border-slate-200 dark:border-zinc-800 space-y-2">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search conversations..."
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
              />
            </div>
          </div>

          <div className="flex gap-1.5 text-[11px]">
            {/* Status filters */}
            {["all", "waiting", "active", "resolved"].map((s) => (
              <button
                key={s}
                onClick={() =>
                  setFilters((f) => ({
                    ...f,
                    status: s === "all" ? undefined : s,
                  }))
                }
                className={cn(
                  "px-2 py-0.5 rounded-full border transition-colors capitalize",
                  (filters.status || "all") === s
                    ? "border-teal-500 text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-500/10"
                    : "border-slate-200 dark:border-zinc-700 text-zinc-500 hover:border-zinc-400"
                )}
              >
                {s}
              </button>
            ))}

            {/* Site filter */}
            {sites && sites.length > 1 && (
              <select
                value={filters.site_id || ""}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    site_id: e.target.value || undefined,
                  }))
                }
                className="px-2 py-0.5 rounded-full border border-slate-200 dark:border-zinc-700 text-zinc-500 bg-white dark:bg-zinc-900 text-[11px]"
              >
                <option value="">All sites</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center p-8">
              <div className="w-5 h-5 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!isLoading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center p-6 text-center mt-8">
              <MessageSquare
                size={40}
                className="text-zinc-300 dark:text-zinc-700 mb-3"
              />
              <p className="text-sm text-zinc-500">No conversations</p>
              <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-1">
                Conversations will appear here when customers start chatting
              </p>
            </div>
          )}

          {filtered.map((conv) => (
            <ConversationRow
              key={conv.id}
              conversation={conv}
              isSelected={conv.id === selectedId}
              onClick={() => onSelect(conv.id)}
            />
          ))}
        </div>
      </div>

      {/* Detail panel */}
      {selectedId && (
        <div
          className="relative flex flex-col overflow-hidden"
          style={{ flex: `0 0 ${detailWidth}%` }}
        >
          {/* Resize handle */}
          <div
            onMouseDown={onResizeStart}
            className="absolute top-0 -left-1 w-3 h-full cursor-col-resize z-10 group"
          >
            <div className="w-0.5 h-full mx-auto bg-transparent group-hover:bg-teal-500/60 transition-colors" />
          </div>

          <ChatPanel
            conversationId={selectedId}
            onClose={() => onSelect(null)}
          />
        </div>
      )}
    </>
  );
}

function ConversationRow({
  conversation,
  isSelected,
  onClick,
}: {
  conversation: Conversation;
  isSelected: boolean;
  onClick: () => void;
}) {
  const site = conversation.site as unknown as { slug: string; name: string } | undefined;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-3 border-b border-slate-100 dark:border-zinc-800/50 transition-colors",
        "hover:bg-slate-50 dark:hover:bg-zinc-900/50",
        isSelected &&
          "bg-teal-50 dark:bg-teal-500/10 border-l-2 border-l-teal-500"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
              {conversation.customer_name || "Anonymous"}
            </span>
            <span className={cn("w-2 h-2 rounded-full flex-shrink-0", statusColor(conversation.status))} />
          </div>
          {conversation.customer_email && (
            <div className="text-[11px] text-zinc-400 truncate mt-0.5">
              {conversation.customer_email}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="text-[10px] text-zinc-400">
            {timeAgo(conversation.updated_at)}
          </span>
          {site && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-zinc-500 uppercase">
              {site.slug}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
