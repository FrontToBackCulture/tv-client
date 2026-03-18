// src/components/notifications/NotificationBell.tsx
// Bell icon with unread badge + notification panel
// Notion-style: each notification has a resolve button, panel stays open

import { useState, useRef, useEffect } from "react";
import { Bell, Check, CheckCheck, X } from "lucide-react";
import { useAuth } from "../../stores/authStore";
import { useNotifications, useUnreadCount, useMarkRead, useMarkAllRead } from "../../hooks/useNotifications";
import { useUsers } from "../../hooks/work";
import { cn } from "../../lib/cn";
import { useAppStore, type ModuleId } from "../../stores/appStore";
import { useNotificationNavStore } from "../../stores/notificationNavStore";
import { useTabStore } from "../../stores/tabStore";
import { useRepositoryStore } from "../../stores/repositoryStore";

// Map entity_type to module for navigation
const ENTITY_MODULE: Record<string, ModuleId> = {
  file: "library",
  crm_deal: "projects",
  crm_company: "projects",
  task: "projects",
  project: "projects",
  workspace: "projects",
  campaign: "email",
  domain: "domains",
  domain_artifact: "domains",
};

const ENTITY_LABELS: Record<string, string> = {
  file: "file",
  crm_deal: "deal",
  crm_company: "company",
  task: "task",
  project: "project",
  workspace: "workspace",
  campaign: "campaign",
  domain: "domain",
  domain_artifact: "artifact",
};

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-SG", { month: "short", day: "numeric" });
}

interface NotificationBellProps {
  collapsed?: boolean;
}

export function NotificationBell({ collapsed = false }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const [panelPos, setPanelPos] = useState<{ left: number; bottom: number }>({ left: 0, bottom: 0 });

  const user = useAuth((s) => s.user);
  const { data: allUsers = [] } = useUsers();
  const matchedUser = allUsers.find(
    (u) => u.github_username === user?.login || u.name === (user?.name || user?.login)
  );
  const currentUser = matchedUser?.name || user?.name || user?.login || "";

  const { data: unreadCount = 0 } = useUnreadCount(currentUser);
  const { data: notifications = [] } = useNotifications(currentUser);
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const setActiveModule = useAppStore((s) => s.setActiveModule);
  const setNavTarget = useNotificationNavStore((s) => s.setTarget);
  const openTab = useTabStore((s) => s.openTab);
  const knowledgePath = useRepositoryStore((s) => {
    const repo = s.repositories.find((r) => r.id === s.activeRepositoryId);
    return repo?.path || "";
  });

  // Split into unresolved (unread) and resolved (read)
  const unresolved = notifications.filter((n) => !n.read);
  const resolved = notifications.filter((n) => n.read);
  const displayList = showResolved ? resolved : unresolved;

  function toggleOpen() {
    if (!isOpen && bellRef.current) {
      const rect = bellRef.current.getBoundingClientRect();
      setPanelPos({
        left: rect.right + 8,
        bottom: window.innerHeight - rect.bottom,
      });
    }
    setIsOpen(!isOpen);
  }

  // Close on click outside (check both panel and bell button)
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        panelRef.current && !panelRef.current.contains(target) &&
        bellRef.current && !bellRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen]);

  if (!currentUser) return null;

  function handleNotificationClick(entityType: string, entityId: string) {
    const module = ENTITY_MODULE[entityType];
    if (module) {
      setActiveModule(module);
    }

    // For files: open the file tab directly and auto-open discussion sidebar
    if (entityType === "file" && knowledgePath) {
      const fullPath = `${knowledgePath}/${entityId}`;
      const fileName = entityId.split("/").pop() || entityId;
      openTab(fullPath, fileName, false);
    }

    // For other entities: set a nav target so the module can handle it
    setNavTarget(entityType, entityId, true);
    setIsOpen(false);
  }

  function handleResolve(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    markRead.mutate(id);
  }

  function handleResolveAll() {
    markAllRead.mutate(currentUser);
  }

  return (
    <>
      {/* Bell button */}
      {collapsed ? (
        <button
          ref={bellRef}
          onClick={toggleOpen}
          className={cn(
            "w-10 h-10 flex items-center justify-center rounded-lg transition-colors relative",
            "hover:bg-zinc-200 dark:hover:bg-zinc-800",
            isOpen
              ? "bg-zinc-200 dark:bg-zinc-800 text-teal-600 dark:text-teal-400"
              : "text-zinc-600 dark:text-zinc-400"
          )}
          title="Notifications"
        >
          <Bell size={20} />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 min-w-[16px] h-[16px] flex items-center justify-center text-[9px] font-bold bg-red-500 text-white rounded-full px-0.5">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      ) : (
        <button
          ref={bellRef}
          onClick={toggleOpen}
          className={cn(
            "w-full h-9 flex items-center gap-2.5 px-3 rounded-lg transition-colors relative",
            "hover:bg-zinc-200 dark:hover:bg-zinc-800",
            isOpen
              ? "bg-zinc-200 dark:bg-zinc-800 text-teal-600 dark:text-teal-400"
              : "text-zinc-600 dark:text-zinc-400"
          )}
          title="Notifications"
        >
          <Bell size={18} className="shrink-0" />
          <span className="text-sm truncate flex-1 text-left">Notifications</span>
          {unreadCount > 0 && (
            <span className="min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full px-1">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      )}

      {/* Panel — fixed positioning to escape overflow-hidden */}
      {isOpen && (
        <div
          ref={panelRef}
          className="fixed z-50 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl overflow-hidden w-[380px]"
          style={{
            left: panelPos.left,
            bottom: panelPos.bottom,
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                Notifications
              </span>
              {/* Toggle: Open / Resolved */}
              <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-md p-0.5">
                <button
                  onClick={() => setShowResolved(false)}
                  className={cn(
                    "px-2 py-0.5 text-[10px] font-medium rounded transition-colors",
                    !showResolved
                      ? "bg-white dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 shadow-sm"
                      : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                  )}
                >
                  Open{unresolved.length > 0 ? ` (${unresolved.length})` : ""}
                </button>
                <button
                  onClick={() => setShowResolved(true)}
                  className={cn(
                    "px-2 py-0.5 text-[10px] font-medium rounded transition-colors",
                    showResolved
                      ? "bg-white dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 shadow-sm"
                      : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                  )}
                >
                  Resolved
                </button>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {!showResolved && unresolved.length > 0 && (
                <button
                  onClick={handleResolveAll}
                  className="flex items-center gap-1 text-[10px] text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 px-1.5 py-0.5 rounded hover:bg-teal-50 dark:hover:bg-teal-950"
                  title="Resolve all"
                >
                  <CheckCheck size={12} />
                  All
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[400px] overflow-auto">
            {displayList.length === 0 ? (
              <div className="py-8 text-center">
                {showResolved ? (
                  <>
                    <CheckCheck size={20} className="mx-auto mb-2 text-zinc-300 dark:text-zinc-700" />
                    <p className="text-xs text-zinc-400">No resolved notifications</p>
                  </>
                ) : (
                  <>
                    <Bell size={20} className="mx-auto mb-2 text-zinc-300 dark:text-zinc-700" />
                    <p className="text-xs text-zinc-400">All caught up</p>
                  </>
                )}
              </div>
            ) : (
              displayList.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n.entity_type, n.entity_id)}
                  className={cn(
                    "group flex items-start gap-2 px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800/50 transition-colors cursor-pointer",
                    !n.read
                      ? "bg-teal-50/40 dark:bg-teal-950/20 hover:bg-teal-50/70 dark:hover:bg-teal-950/40"
                      : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  )}
                >
                  {/* Unread dot */}
                  {!n.read && (
                    <div className="w-2 h-2 rounded-full bg-teal-500 mt-1.5 flex-shrink-0" />
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-zinc-800 dark:text-zinc-200">
                      <span className="font-semibold text-teal-600 dark:text-teal-400">
                        @{n.actor}
                      </span>
                      {n.type === "resolved"
                        ? " resolved a comment you were tagged in on a "
                        : n.type === "reply"
                        ? " replied to your comment on a "
                        : " mentioned you on a "}
                      <span className="font-medium">
                        {ENTITY_LABELS[n.entity_type] || n.entity_type}
                      </span>
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2">
                      {n.body_preview}
                    </p>
                    <p className="text-[10px] text-zinc-400 mt-1">
                      {formatRelativeTime(n.created_at)}
                    </p>
                  </div>

                  {/* Resolve button — only on unresolved */}
                  {!n.read && (
                    <button
                      onClick={(e) => handleResolve(e, n.id)}
                      className="flex-shrink-0 p-1 rounded text-zinc-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950 opacity-0 group-hover:opacity-100 transition-all"
                      title="Resolve"
                    >
                      <Check size={14} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}
