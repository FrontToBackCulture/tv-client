// src/modules/gallery/GalleryModule.tsx

import { useState, useMemo, useEffect, useCallback } from "react";
import { Search, X, Loader2, ChevronRight, FileText, Image as ImageIcon, PenTool, Video, Pin, PinOff, ArrowUpDown, ChevronDown, Presentation } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Button, IconButton } from "../../components/ui";
import { SectionLoading } from "../../components/ui/DetailStates";
import { cn } from "../../lib/cn";
import { useGalleryScan, useSkillDemos, type GalleryTab, type GalleryItem, type SkillExample } from "./useGallery";
import { useReadFile } from "../../hooks/useFiles";
import { ImageEditor } from "./ImageEditor";
import { ExcalidrawEditor } from "./ExcalidrawEditor";
import { useSkillRegistry, useSkillRegistryUpdate } from "../skills/useSkillRegistry";

// ─── Tabs ────────────────────────────────────────────────────────────────────

const TABS: { id: GalleryTab; label: string; icon: typeof FileText }[] = [
  { id: "reports", label: "Reports", icon: FileText },
  { id: "decks", label: "Decks", icon: Presentation },
  { id: "images", label: "Images", icon: ImageIcon },
  { id: "excalidraw", label: "Excalidraw", icon: PenTool },
  { id: "videos", label: "Videos", icon: Video },
];

// ─── Main Module ─────────────────────────────────────────────────────────────

export function GalleryModule() {
  const [tab, setTab] = useState<GalleryTab>("reports");
  const [search, setSearch] = useState("");

  const { data: galleryItems = [], isLoading: scanLoading } = useGalleryScan();
  const { data: demos = [], isLoading: demosLoading } = useSkillDemos();

  // Map tab IDs to gallery_type values from Rust
  const tabToType: Record<string, string> = { images: "image", excalidraw: "excalidraw", videos: "video" };

  // Split demos by type
  const reportDemos = useMemo(() => demos.filter(d => d.demo_type !== "deck"), [demos]);
  const deckDemos = useMemo(() => demos.filter(d => d.demo_type === "deck"), [demos]);

  // Counts per type
  const counts = useMemo(() => ({
    reports: reportDemos.length,
    decks: deckDemos.length,
    images: galleryItems.filter(i => i.gallery_type === "image").length,
    excalidraw: galleryItems.filter(i => i.gallery_type === "excalidraw").length,
    videos: galleryItems.filter(i => i.gallery_type === "video").length,
  }), [galleryItems, reportDemos, deckDemos]);

  return (
    <div className="h-full flex flex-col">
      {/* Header: tabs + search */}
      <div className="flex-shrink-0 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-4 px-4 pt-3 pb-0">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setSearch(""); }}
              className={cn(
                "flex items-center gap-1.5 px-1 pb-2 text-sm font-medium border-b-2 transition-colors",
                tab === t.id
                  ? "border-teal-500 text-teal-600 dark:text-teal-400"
                  : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
              )}
            >
              <t.icon size={14} />
              {t.label}
              <span className="text-xs text-zinc-400 ml-0.5">({counts[t.id]})</span>
            </button>
          ))}
        </div>
        <div className="px-4 py-2">
          <div className="relative max-w-md">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={`Filter ${tab}...`}
              className="w-full pl-8 pr-8 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
            {search && (
              <IconButton icon={X} size={12} label="Clear" onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2" />
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {tab === "reports" ? (
          <div className="flex-1 overflow-y-auto">
            <ReportsTab demos={reportDemos} search={search} isLoading={demosLoading} />
          </div>
        ) : tab === "decks" ? (
          <div className="flex-1 overflow-y-auto">
            <DecksTab demos={deckDemos} search={search} isLoading={demosLoading} />
          </div>
        ) : (
          <FileGalleryTab
            items={galleryItems.filter(i => i.gallery_type === (tabToType[tab] ?? tab))}
            search={search}
            isLoading={scanLoading}
            galleryType={tab}
          />
        )}
      </div>
    </div>
  );
}

// ─── Reports Tab (demo HTML from skills) ─────────────────────────────────────

type ReportSort = "name" | "date" | "category";

function ReportsTab({ demos, search, isLoading }: { demos: SkillExample[]; search: string; isLoading: boolean }) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<ReportSort>("category");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const { data: selectedHtml } = useReadFile(selectedPath ?? undefined);
  const { data: registry } = useSkillRegistry();
  const registryUpdate = useSkillRegistryUpdate();

  const selectedExample = demos.find(e => e.file_path === selectedPath);

  const iframeSrcDoc = useMemo(() => {
    if (!selectedHtml) return undefined;
    const overrideStyle = `<style>body,body>*{max-width:100%!important;width:100%!important;box-sizing:border-box!important}body{margin:0!important;padding:1rem!important;overflow-x:hidden!important}img,table,pre{max-width:100%!important}</style>`;
    if (selectedHtml.includes("</head>")) {
      return selectedHtml.replace("</head>", `${overrideStyle}</head>`);
    }
    return overrideStyle + selectedHtml;
  }, [selectedHtml]);

  // Build category label map
  const categoryLabels = useMemo(() => {
    const map: Record<string, string> = {};
    if (registry?.categories) {
      for (const cat of registry.categories) {
        map[cat.id] = cat.label;
      }
    }
    return map;
  }, [registry]);

  // Get category order map for sorting
  const categoryOrder = useMemo(() => {
    const map: Record<string, number> = {};
    if (registry?.categories) {
      registry.categories.forEach((cat, idx) => {
        map[cat.id] = cat.order ?? idx;
      });
    }
    return map;
  }, [registry]);

  const togglePin = useCallback((slug: string) => {
    if (!registry) return;
    const entry = registry.skills[slug];
    if (!entry) return;
    const today = new Date().toISOString().slice(0, 10);
    const updatedRegistry = {
      ...registry,
      updated: today,
      skills: {
        ...registry.skills,
        [slug]: { ...entry, gallery_pinned: !entry.gallery_pinned },
      },
    };
    registryUpdate.mutate(updatedRegistry);
  }, [registry, registryUpdate]);

  // Filter, sort, and group
  const { pinnedItems, groups } = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = demos.filter(ex =>
      !q || ex.skill_name.toLowerCase().includes(q) || ex.file_name.toLowerCase().includes(q) || ex.slug.toLowerCase().includes(q)
    );

    // Enrich with registry data
    const enriched = filtered.map(ex => ({
      ...ex,
      pinned: registry?.skills[ex.slug]?.gallery_pinned ?? false,
      category: registry?.skills[ex.slug]?.category ?? "uncategorized",
      order: registry?.skills[ex.slug]?.gallery_order ?? 999,
    }));

    // Separate pinned
    const pinned = enriched.filter(e => e.pinned);
    const unpinned = enriched.filter(e => !e.pinned);

    // Sort function
    const sortFn = (a: typeof enriched[0], b: typeof enriched[0]) => {
      if (sortBy === "name") return a.skill_name.localeCompare(b.skill_name);
      if (sortBy === "date") return (b.modified || "").localeCompare(a.modified || "");
      // category sort: by order field, then name
      const diff = a.order - b.order;
      return diff !== 0 ? diff : a.skill_name.localeCompare(b.skill_name);
    };

    pinned.sort(sortFn);

    // Group unpinned by category if sorting by category
    if (sortBy === "category") {
      const grouped: Record<string, typeof enriched> = {};
      for (const item of unpinned) {
        const cat = item.category;
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(item);
      }
      // Sort items within each group
      for (const cat in grouped) {
        grouped[cat].sort((a, b) => {
          const diff = a.order - b.order;
          return diff !== 0 ? diff : a.skill_name.localeCompare(b.skill_name);
        });
      }
      // Sort category groups by category order
      const sortedGroups = Object.entries(grouped).sort(
        ([a], [b]) => (categoryOrder[a] ?? 999) - (categoryOrder[b] ?? 999)
      );
      return { pinnedItems: pinned, groups: sortedGroups };
    }

    // Flat sort for name/date
    unpinned.sort(sortFn);
    return { pinnedItems: pinned, groups: [["all", unpinned] as [string, typeof enriched]] };
  }, [demos, search, registry, sortBy, categoryOrder]);

  if (isLoading) return <SectionLoading className="py-12" />;

  if (selectedPath && iframeSrcDoc) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-shrink-0 px-4 pt-3 pb-2">
          <Button
            variant="ghost"
            icon={ChevronRight}
            onClick={() => setSelectedPath(null)}
            className="mb-2 [&_svg:first-child]:rotate-180"
          >
            Back to gallery
          </Button>
          {selectedExample && (
            <div>
              <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{selectedExample.skill_name}</h2>
              <p className="text-xs text-zinc-400">{selectedExample.file_name}</p>
            </div>
          )}
        </div>
        <div className="flex-1 min-h-0 px-4 pb-4">
          <iframe
            srcDoc={iframeSrcDoc}
            className="w-full h-full border-0 rounded-lg border border-zinc-200 dark:border-zinc-800"
            sandbox="allow-scripts"
          />
        </div>
      </div>
    );
  }

  const totalCount = pinnedItems.length + groups.reduce((n, [, items]) => n + items.length, 0);
  const sortLabels: Record<ReportSort, string> = { name: "Name A-Z", date: "Newest First", category: "Category" };

  return (
    <div className="p-4">
      {/* Sort controls */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-zinc-400">{totalCount} reports</span>
        <div className="relative">
          <button
            onClick={() => setShowSortMenu(!showSortMenu)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors"
          >
            <ArrowUpDown size={12} />
            {sortLabels[sortBy]}
            <ChevronDown size={10} />
          </button>
          {showSortMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowSortMenu(false)} />
              <div className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg py-1 min-w-[140px]">
                {(["category", "name", "date"] as ReportSort[]).map(opt => (
                  <button
                    key={opt}
                    onClick={() => { setSortBy(opt); setShowSortMenu(false); }}
                    className={cn(
                      "w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800",
                      sortBy === opt ? "text-teal-600 dark:text-teal-400 font-medium" : "text-zinc-600 dark:text-zinc-300"
                    )}
                  >
                    {sortLabels[opt]}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {totalCount === 0 ? (
        <div className="text-center py-8 text-xs text-zinc-400">
          {search ? `No reports matching "${search}"` : "No demo reports found in _skills/*/demo/"}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Pinned section */}
          {pinnedItems.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Pin size={11} className="text-teal-500" />
                <h3 className="text-xs font-semibold text-teal-600 dark:text-teal-400 uppercase tracking-wider">Pinned</h3>
              </div>
              <div className="grid grid-cols-4 gap-3">
                {pinnedItems.map(ex => (
                  <ReportThumbnail
                    key={ex.file_path}
                    example={ex}
                    pinned
                    onTogglePin={() => togglePin(ex.slug)}
                    onClick={() => setSelectedPath(ex.file_path)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Category groups (or flat list) */}
          {groups.map(([catId, items]) => (
            <div key={catId}>
              {sortBy === "category" && (
                <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
                  {categoryLabels[catId] || catId}
                </h3>
              )}
              <div className="grid grid-cols-4 gap-3">
                {items.map(ex => (
                  <ReportThumbnail
                    key={ex.file_path}
                    example={ex}
                    pinned={ex.pinned}
                    onTogglePin={() => togglePin(ex.slug)}
                    onClick={() => setSelectedPath(ex.file_path)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReportThumbnail({ example, pinned, onTogglePin, onClick }: {
  example: SkillExample;
  pinned?: boolean;
  onTogglePin?: () => void;
  onClick: () => void;
}) {
  const { data: htmlContent } = useReadFile(example.file_path);

  const thumbSrcDoc = useMemo(() => {
    if (!htmlContent) return undefined;
    const thumbStyle = `<style>body{margin:0!important;padding:0.5rem!important;overflow:hidden!important;pointer-events:none!important}body,body>*{max-width:100%!important;width:100%!important;box-sizing:border-box!important}img,table,pre{max-width:100%!important}</style>`;
    if (htmlContent.includes("</head>")) {
      return htmlContent.replace("</head>", `${thumbStyle}</head>`);
    }
    return thumbStyle + htmlContent;
  }, [htmlContent]);

  return (
    <div className="group relative rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden text-left hover:border-teal-300 dark:hover:border-teal-700 hover:shadow-sm transition-all">
      {/* Pin button - top right corner */}
      {onTogglePin && (
        <button
          onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
          className={cn(
            "absolute top-1.5 right-1.5 z-10 p-1 rounded-md transition-all",
            pinned
              ? "bg-teal-500/90 text-white opacity-100"
              : "bg-black/40 text-white opacity-0 group-hover:opacity-100"
          )}
          title={pinned ? "Unpin" : "Pin to top"}
        >
          {pinned ? <PinOff size={10} /> : <Pin size={10} />}
        </button>
      )}
      <button onClick={onClick} className="w-full text-left">
        <div className="relative h-36 overflow-hidden bg-white">
          {thumbSrcDoc ? (
            <iframe
              srcDoc={thumbSrcDoc}
              className="w-[300%] h-[300%] border-0 origin-top-left pointer-events-none"
              style={{ transform: "scale(0.333)" }}
              tabIndex={-1}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <Loader2 size={14} className="animate-spin text-zinc-300" />
            </div>
          )}
          <div className="absolute inset-0 bg-teal-600/0 group-hover:bg-teal-600/5 transition-colors pointer-events-none" />
        </div>
        <div className="px-3 py-2 border-t border-zinc-100 dark:border-zinc-800/50">
          <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">{example.skill_name}</p>
          <p className="text-xs text-zinc-400 truncate">{example.file_name}</p>
        </div>
      </button>
    </div>
  );
}

// ─── Decks Tab ───────────────────────────────────────────────────────────────

function DecksTab({ demos, search, isLoading }: { demos: SkillExample[]; search: string; isLoading: boolean }) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const { data: selectedHtml } = useReadFile(selectedPath ?? undefined);

  const selectedExample = demos.find(e => e.file_path === selectedPath);

  // For decks, no style overrides — let the deck render natively in the iframe
  const iframeSrcDoc = useMemo(() => {
    if (!selectedHtml) return undefined;
    return selectedHtml;
  }, [selectedHtml]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return demos.filter(ex =>
      !q || ex.skill_name.toLowerCase().includes(q) || ex.file_name.toLowerCase().includes(q) || ex.slug.toLowerCase().includes(q)
    );
  }, [demos, search]);

  if (isLoading) return <SectionLoading className="py-12" />;

  // Full-screen deck viewer
  if (selectedPath && iframeSrcDoc) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-shrink-0 px-4 pt-3 pb-2">
          <Button
            variant="ghost"
            icon={ChevronRight}
            onClick={() => setSelectedPath(null)}
            className="mb-2 [&_svg:first-child]:rotate-180"
          >
            Back to gallery
          </Button>
          {selectedExample && (
            <div>
              <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{selectedExample.skill_name}</h2>
              <p className="text-xs text-zinc-400">{selectedExample.file_name}</p>
            </div>
          )}
        </div>
        <div className="flex-1 min-h-0 px-4 pb-4">
          <iframe
            srcDoc={iframeSrcDoc}
            className="w-full h-full border-0 rounded-lg border border-zinc-200 dark:border-zinc-800"
            sandbox="allow-scripts"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-zinc-400">{filtered.length} decks</span>
      </div>
      {filtered.length === 0 ? (
        <div className="text-center py-8 text-xs text-zinc-400">
          {search ? `No decks matching "${search}"` : "No demo decks found in _skills/*/demo/"}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {filtered.map(ex => (
            <DeckThumbnail key={ex.file_path} example={ex} onClick={() => setSelectedPath(ex.file_path)} />
          ))}
        </div>
      )}
    </div>
  );
}

function DeckThumbnail({ example, onClick }: { example: SkillExample; onClick: () => void }) {
  const { data: htmlContent } = useReadFile(example.file_path);

  // Show first slide only — inject style to hide everything after first slide + nav
  const thumbSrcDoc = useMemo(() => {
    if (!htmlContent) return undefined;
    const thumbStyle = `<style>
      html{scroll-snap-type:none!important;overflow:hidden!important}
      body{margin:0!important;padding:0!important;overflow:hidden!important;pointer-events:none!important}
      .slide~.slide{display:none!important}
      .nav-dots,.keyboard-hint,.progress-bar{display:none!important}
      .slide{height:100vh!important;scroll-snap-align:none!important}
    </style>`;
    if (htmlContent.includes("</head>")) {
      return htmlContent.replace("</head>", `${thumbStyle}</head>`);
    }
    return thumbStyle + htmlContent;
  }, [htmlContent]);

  return (
    <div className="group relative rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden text-left hover:border-teal-300 dark:hover:border-teal-700 hover:shadow-sm transition-all">
      <button onClick={onClick} className="w-full text-left">
        <div className="relative overflow-hidden bg-zinc-900" style={{ aspectRatio: "16/9" }}>
          {thumbSrcDoc ? (
            <iframe
              srcDoc={thumbSrcDoc}
              className="w-[400%] h-[400%] border-0 origin-top-left pointer-events-none"
              style={{ transform: "scale(0.25)" }}
              tabIndex={-1}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <Loader2 size={14} className="animate-spin text-zinc-500" />
            </div>
          )}
          <div className="absolute inset-0 bg-teal-600/0 group-hover:bg-teal-600/5 transition-colors pointer-events-none" />
        </div>
        <div className="px-3 py-2 border-t border-zinc-100 dark:border-zinc-800/50">
          <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">{example.skill_name}</p>
          <p className="text-xs text-zinc-400 truncate">{example.file_name}</p>
        </div>
      </button>
    </div>
  );
}

// ─── File Gallery Tab (images, excalidraw, videos) ───────────────────────────

function FileGalleryTab({ items, search, isLoading, galleryType }: {
  items: GalleryItem[];
  search: string;
  isLoading: boolean;
  galleryType: string;
}) {
  const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);
  const [editMode, setEditMode] = useState(false);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter(i =>
      !q || i.file_name.toLowerCase().includes(q) || i.folder.toLowerCase().includes(q)
    );
  }, [items, search]);

  if (isLoading) return <div className="flex-1 flex items-center justify-center py-12"><SectionLoading /></div>;

  if (selectedItem) {
    // Edit mode — full editor
    if (editMode) {
      if (selectedItem.gallery_type === "excalidraw") {
        return <ExcalidrawEditor item={selectedItem} onBack={() => setEditMode(false)} />;
      }
      if (selectedItem.gallery_type === "image") {
        return <ImageEditor item={selectedItem} onBack={() => setEditMode(false)} />;
      }
    }

    // Preview mode — view with optional Edit button
    const canEdit = selectedItem.gallery_type === "image" || selectedItem.gallery_type === "excalidraw";
    return (
      <div className="flex flex-col h-full">
        <div className="flex-shrink-0 px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              icon={ChevronRight}
              onClick={() => { setSelectedItem(null); setEditMode(false); }}
              className="[&_svg:first-child]:rotate-180"
            >
              Back
            </Button>
            <div>
              <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{selectedItem.file_name}</h2>
              <p className="text-xs text-zinc-400">{selectedItem.folder}</p>
            </div>
          </div>
          {canEdit && (
            <Button size="md" icon={PenTool} onClick={() => setEditMode(true)}>
              Edit
            </Button>
          )}
        </div>
        <div className="flex-1 min-h-0 px-4 pb-4 flex items-center justify-center">
          <FilePreview item={selectedItem} fullSize />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {filtered.length === 0 ? (
        <div className="text-center py-8 text-xs text-zinc-400">
          {search ? `No ${galleryType} files matching "${search}"` : `No ${galleryType} files found`}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-3">
          {filtered.map(item => (
            <FileCard key={item.file_path} item={item} onClick={() => setSelectedItem(item)} />
          ))}
        </div>
      )}
    </div>
  );
}

function FileCard({ item, onClick }: { item: GalleryItem; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden text-left hover:border-teal-300 dark:hover:border-teal-700 hover:shadow-sm transition-all"
    >
      <div className="relative h-36 overflow-hidden bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center">
        <FilePreview item={item} />
        <div className="absolute inset-0 bg-teal-600/0 group-hover:bg-teal-600/5 transition-colors" />
      </div>
      <div className="px-3 py-2 border-t border-zinc-100 dark:border-zinc-800/50">
        <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">{item.file_name}</p>
        <p className="text-xs text-zinc-400 truncate">{item.folder}</p>
        <p className="text-[10px] text-zinc-300 dark:text-zinc-600 mt-0.5">
          {item.modified ? item.modified.slice(0, 10) : ""}
          {item.size_bytes > 0 && ` · ${formatSize(item.size_bytes)}`}
        </p>
      </div>
    </button>
  );
}

function FilePreview({ item, fullSize }: { item: GalleryItem; fullSize?: boolean }) {
  if (item.gallery_type === "image") {
    return (
      <img
        src={convertFileSrc(item.file_path)}
        alt={item.file_name}
        className={fullSize ? "max-w-full max-h-full object-contain" : "w-full h-full object-cover"}
        loading="lazy"
      />
    );
  }

  if (item.gallery_type === "excalidraw") {
    return <ExcalidrawPreview filePath={item.file_path} fullSize={fullSize} />;
  }

  if (item.gallery_type === "video") {
    if (fullSize) {
      return (
        <video
          src={convertFileSrc(item.file_path)}
          controls
          className="max-w-full max-h-full"
        />
      );
    }
    return (
      <div className="flex flex-col items-center gap-2 text-zinc-400">
        <Video size={24} />
      </div>
    );
  }

  return null;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Excalidraw Preview ──────────────────────────────────────────────────────

function ExcalidrawPreview({ filePath, fullSize }: { filePath: string; fullSize?: boolean }) {
  const { data: content } = useReadFile(filePath);
  const [svgHtml, setSvgHtml] = useState<string | null>(null);

  useEffect(() => {
    if (!content) return;
    let cancelled = false;

    async function render() {
      try {
        const data = JSON.parse(content!);
        const { exportToSvg } = await import("@excalidraw/excalidraw");
        const svg = await exportToSvg({
          elements: data.elements || [],
          appState: {
            exportWithDarkMode: false,
            exportBackground: true,
            viewBackgroundColor: data.appState?.viewBackgroundColor || "#ffffff",
          },
          files: data.files || {},
        });
        if (!cancelled) {
          setSvgHtml(new XMLSerializer().serializeToString(svg));
        }
      } catch {
        // Silently fail — show nothing
      }
    }

    render();
    return () => { cancelled = true; };
  }, [content]);

  if (!svgHtml) {
    return (
      <div className="flex items-center justify-center text-zinc-300">
        <Loader2 size={fullSize ? 24 : 14} className="animate-spin" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "[&_svg]:max-w-full [&_svg]:h-auto",
        fullSize
          ? "w-full h-full flex items-center justify-center overflow-auto p-4"
          : "w-full h-full overflow-hidden"
      )}
      dangerouslySetInnerHTML={{ __html: svgHtml }}
    />
  );
}
