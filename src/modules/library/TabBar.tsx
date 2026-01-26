// src/modules/library/TabBar.tsx
// VS Code-style tab bar for open files/folders in the Library module

import { useCallback, useRef, useState, useEffect } from "react";
import { X, File, Folder, Columns2 } from "lucide-react";
import { cn } from "../../lib/cn";
import { Tab, useTabStore } from "../../stores/tabStore";

export function TabBar() {
  const { tabs, activeTabId, splitOpen, setActiveTab, closeTab, closeAllTabs, closeOtherTabs, openSplit, closeSplit } = useTabStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tabId: string } | null>(null);

  // Horizontal scroll with mouse wheel
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (scrollRef.current) {
      e.preventDefault();
      scrollRef.current.scrollLeft += e.deltaY;
    }
  }, []);

  // Middle-click to close
  const handleMouseDown = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      if (e.button === 1) {
        e.preventDefault();
        closeTab(tabId);
      }
    },
    [closeTab]
  );

  // Right-click context menu
  const handleContextMenu = useCallback((e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, tabId });
  }, []);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [contextMenu]);

  if (tabs.length === 0) return null;

  return (
    <div className="flex-shrink-0 border-b border-slate-200 dark:border-zinc-800 bg-slate-100 dark:bg-zinc-900 relative">
      <div className="flex items-center">
        {/* Scrollable tab strip */}
        <div
          ref={scrollRef}
          onWheel={handleWheel}
          className="flex-1 flex overflow-x-auto scrollbar-hide"
        >
          {tabs.map((tab) => (
            <TabItem
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTabId}
              onClick={() => setActiveTab(tab.id)}
              onClose={() => closeTab(tab.id)}
              onMouseDown={(e) => handleMouseDown(e, tab.id)}
              onContextMenu={(e) => handleContextMenu(e, tab.id)}
            />
          ))}
        </div>

        {/* Split view toggle */}
        <button
          onClick={() => splitOpen ? closeSplit() : openSplit()}
          className={cn(
            "flex-shrink-0 p-1.5 mx-1 rounded transition-colors",
            splitOpen
              ? "text-teal-600 dark:text-teal-400 bg-slate-200 dark:bg-zinc-800"
              : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-800"
          )}
          title={splitOpen ? "Close split view" : "Split view"}
        >
          <Columns2 size={14} />
        </button>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => closeTab(contextMenu.tabId)}
          onCloseOthers={() => closeOtherTabs(contextMenu.tabId)}
          onCloseAll={closeAllTabs}
        />
      )}
    </div>
  );
}

// Individual tab
interface TabItemProps {
  tab: Tab;
  isActive: boolean;
  onClick: () => void;
  onClose: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function TabItem({ tab, isActive, onClick, onClose, onMouseDown, onContextMenu }: TabItemProps) {
  return (
    <div
      onClick={onClick}
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
      className={cn(
        "group flex items-center gap-1.5 px-3 py-1.5 text-xs border-r border-slate-200 dark:border-zinc-800 cursor-pointer select-none min-w-0 max-w-[180px] flex-shrink-0",
        isActive
          ? "bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 border-b-2 border-b-teal-500"
          : "bg-slate-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-500 hover:bg-slate-50 dark:hover:bg-zinc-800/50 hover:text-zinc-700 dark:hover:text-zinc-300"
      )}
    >
      {/* Icon */}
      {tab.isDirectory ? (
        <Folder size={13} className="flex-shrink-0 text-teal-500" />
      ) : (
        <File size={13} className="flex-shrink-0" />
      )}

      {/* Name */}
      <span className="truncate">{tab.name}</span>

      {/* Close button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className={cn(
          "ml-auto flex-shrink-0 rounded p-0.5 transition-colors",
          isActive
            ? "opacity-60 hover:opacity-100 hover:bg-slate-200 dark:hover:bg-zinc-800"
            : "opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-slate-200 dark:hover:bg-zinc-700"
        )}
      >
        <X size={12} />
      </button>
    </div>
  );
}

// Right-click context menu
interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onCloseOthers: () => void;
  onCloseAll: () => void;
}

function ContextMenu({ x, y, onClose, onCloseOthers, onCloseAll }: ContextMenuProps) {
  const items = [
    { label: "Close", action: onClose },
    { label: "Close Others", action: onCloseOthers },
    { label: "Close All", action: onCloseAll },
  ];

  return (
    <div
      className="fixed z-50 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg shadow-lg py-1 min-w-[140px]"
      style={{ left: x, top: y }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          onClick={(e) => {
            e.stopPropagation();
            item.action();
          }}
          className="w-full text-left px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
