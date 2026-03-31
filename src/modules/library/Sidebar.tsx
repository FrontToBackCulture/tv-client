// src/modules/library/Sidebar.tsx

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Search,
  RefreshCw,
  Star,
  Clock,
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  X,
  ChevronsUpDown,
  ChevronsDownUp,
  PanelLeftClose,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { FileTree } from "./FileTree";
import { SearchResults } from "./SearchResults";
import { RepositorySwitcher } from "./RepositorySwitcher";
import { useFileTree, useWatchDirectory } from "../../hooks/useFiles";
import { useSearch } from "../../hooks/useSearch";
import { useRecentFiles, RecentFile } from "../../hooks/useRecentFiles";
import { useFavorites, Favorite } from "../../hooks/useFavorites";
import { useFolderExpansion } from "../../stores/folderExpansionStore";
import { cn } from "../../lib/cn";
import { InlineLoading } from "../../components/ui/DetailStates";

interface SidebarProps {
  knowledgePath: string;
  selectedPath: string | null;
  onFileSelect: (path: string) => void;
  onPinSelect?: (path: string) => void;
  onRepositoryChange?: () => void;
  width?: number;
  onCollapse?: () => void;
}

export function Sidebar({ knowledgePath, selectedPath, onFileSelect, onPinSelect, onRepositoryChange, width = 256, onCollapse }: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showFavorites, setShowFavorites] = useState(true);
  const [showRecent, setShowRecent] = useState(false);

  // Debounce search query (400ms) to avoid hammering file system
  useEffect(() => {
    if (searchQuery.length < 2) {
      setDebouncedQuery("");
      return;
    }
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const queryClient = useQueryClient();

  // Load file tree
  const { data: fileTree, isLoading: treeLoading, isFetching } = useFileTree(knowledgePath, 4);

  // Watch for file changes and auto-refresh
  useWatchDirectory(knowledgePath);

  // Full refresh - invalidates all file-related queries
  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["fileTree"] });
    queryClient.invalidateQueries({ queryKey: ["folderChildren"] });
    queryClient.invalidateQueries({ queryKey: ["directory"] });
  }, [queryClient]);

  // Search when debounced query is present
  const { results: searchResults, isLoading: searchLoading } = useSearch(
    knowledgePath,
    debouncedQuery,
    { enabled: debouncedQuery.length >= 2 }
  );

  // Recent files and favorites
  const { recentFiles, removeRecentFile } = useRecentFiles();
  const { favorites, removeFavorite } = useFavorites();
  const { expandAll, collapseToLevel } = useFolderExpansion();
  const [showCollapseMenu, setShowCollapseMenu] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Handle "go to path" — when search query looks like a relative path and user presses Enter
  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && searchQuery.includes("/")) {
      const resolved = `${knowledgePath}/${searchQuery.replace(/^\//, "")}`;
      onFileSelect(resolved);
      setSearchQuery("");
      searchInputRef.current?.blur();
    }
  }, [searchQuery, knowledgePath, onFileSelect]);

  const showSearch = searchQuery.length >= 2;
  const isDebouncing = searchQuery.length >= 2 && debouncedQuery !== searchQuery;

  return (
    <div
      className="h-full flex flex-col bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex-shrink-0"
      style={{ width: `${width}px` }}
    >
      {/* Repository Switcher */}
      <div className="p-2 border-b border-zinc-200 dark:border-zinc-800">
        <RepositorySwitcher onRepositoryChange={onRepositoryChange} />
      </div>

      {/* Header */}
      <div className="p-3 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {onCollapse && (
              <button
                onClick={onCollapse}
                className="p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors flex-shrink-0"
                title="Collapse panel"
              >
                <PanelLeftClose size={12} />
              </button>
            )}
            <FolderOpen size={16} className="text-zinc-500" />
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Files</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={expandAll}
              className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
              title="Expand All Folders"
            >
              <ChevronsUpDown size={14} className="text-zinc-500" />
            </button>
            <div className="relative">
              <button
                onClick={() => setShowCollapseMenu(!showCollapseMenu)}
                className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
                title="Collapse Folders"
              >
                <ChevronsDownUp size={14} className="text-zinc-500" />
              </button>
              {showCollapseMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowCollapseMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl py-1 min-w-[140px]">
                    <button
                      onClick={() => {
                        collapseToLevel(1);
                        setShowCollapseMenu(false);
                      }}
                      className="w-full text-left px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                      Level 1 (Root)
                    </button>
                    <button
                      onClick={() => {
                        collapseToLevel(2);
                        setShowCollapseMenu(false);
                      }}
                      className="w-full text-left px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                      Level 2
                    </button>
                    <button
                      onClick={() => {
                        collapseToLevel(3);
                        setShowCollapseMenu(false);
                      }}
                      className="w-full text-left px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                      Level 3
                    </button>
                  </div>
                </>
              )}
            </div>
            <button
              onClick={handleRefresh}
              data-help-id="library-refresh"
              className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
              title="Refresh"
            >
              <RefreshCw size={14} className={cn("text-zinc-500", isFetching && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            ref={searchInputRef}
            type="text"
            data-help-id="library-search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search or paste path..."
            className="w-full pl-7 pr-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded text-sm text-zinc-800 dark:text-zinc-300 placeholder:text-zinc-500 focus:outline-none focus:border-teal-500 dark:focus:border-zinc-600"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded"
            >
              <X size={12} className="text-zinc-500" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {showSearch ? (
          <SearchResults
            results={searchResults}
            isLoading={searchLoading || isDebouncing}
            onSelect={(result) => onFileSelect(result.path)}
            selectedPath={selectedPath}
          />
        ) : (
          <>
            {/* Favorites Section */}
            {favorites.length > 0 && (
              <div className="border-b border-zinc-200 dark:border-zinc-800">
                <button
                  onClick={() => setShowFavorites(!showFavorites)}
                  data-help-id="library-favorites"
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors"
                >
                  {showFavorites ? (
                    <ChevronDown size={12} />
                  ) : (
                    <ChevronRight size={12} />
                  )}
                  <Star size={12} className="text-yellow-500" />
                  <span>Favorites</span>
                  <span className="ml-auto text-zinc-500 dark:text-zinc-600">{favorites.length}</span>
                </button>
                {showFavorites && (
                  <div className="pb-2">
                    {favorites.map((fav: Favorite) => (
                      <FavoriteItem
                        key={fav.path}
                        item={fav}
                        isSelected={selectedPath === fav.path}
                        onClick={() => onFileSelect(fav.path)}
                        onRemove={() => removeFavorite(fav.path)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Recent Files Section */}
            {recentFiles.length > 0 && (
              <div className="border-b border-zinc-200 dark:border-zinc-800">
                <button
                  onClick={() => setShowRecent(!showRecent)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors"
                >
                  {showRecent ? (
                    <ChevronDown size={12} />
                  ) : (
                    <ChevronRight size={12} />
                  )}
                  <Clock size={12} className="text-zinc-500" />
                  <span>Recent</span>
                  <span className="ml-auto text-zinc-500 dark:text-zinc-600">{recentFiles.length}</span>
                </button>
                {showRecent && (
                  <div className="pb-2 max-h-48 overflow-y-auto">
                    {recentFiles.slice(0, 10).map((file: RecentFile) => (
                      <RecentItem
                        key={file.path}
                        item={file}
                        isSelected={selectedPath === file.path}
                        onClick={() => onFileSelect(file.path)}
                        onRemove={() => removeRecentFile(file.path)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* File Tree */}
            {treeLoading ? (
              <div className="p-4"><InlineLoading message="Loading..." /></div>
            ) : fileTree ? (
              <FileTree
                node={fileTree}
                selectedPath={selectedPath}
                onSelect={onFileSelect}
                onPinSelect={onPinSelect}
                level={0}
              />
            ) : (
              <div className="p-4 text-center text-zinc-500 dark:text-zinc-500 text-sm">
                No files found
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-zinc-200 dark:border-zinc-800">
        <div className="text-xs text-zinc-500 dark:text-zinc-600 truncate" title={knowledgePath}>
          {knowledgePath}
        </div>
      </div>
    </div>
  );
}

// Favorite item component
function FavoriteItem({
  item,
  isSelected,
  onClick,
  onRemove,
}: {
  item: Favorite;
  isSelected: boolean;
  onClick: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors",
        isSelected
          ? "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400"
          : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:text-zinc-800 dark:hover:text-zinc-300"
      )}
      onClick={onClick}
    >
      {item.isDirectory ? (
        <Folder size={14} className="text-teal-500 flex-shrink-0" />
      ) : (
        <File size={14} className="flex-shrink-0" />
      )}
      <span className="text-sm truncate flex-1">{item.name}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-opacity"
        title="Remove from favorites"
      >
        <X size={12} />
      </button>
    </div>
  );
}

// Recent item component
function RecentItem({
  item,
  isSelected,
  onClick,
  onRemove,
}: {
  item: RecentFile;
  isSelected: boolean;
  onClick: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors",
        isSelected
          ? "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400"
          : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:text-zinc-800 dark:hover:text-zinc-300"
      )}
      onClick={onClick}
    >
      {item.isDirectory ? (
        <Folder size={14} className="text-teal-500 flex-shrink-0" />
      ) : (
        <File size={14} className="flex-shrink-0" />
      )}
      <span className="text-sm truncate flex-1">{item.name}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-opacity"
        title="Remove from recent"
      >
        <X size={12} />
      </button>
    </div>
  );
}
