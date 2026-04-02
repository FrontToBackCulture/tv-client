// src/modules/guides/ScreenshotsPanel.tsx

import { useState, useEffect, useMemo } from "react";
import { readDir, readTextFile } from "@tauri-apps/plugin-fs";
import { convertFileSrc } from "@tauri-apps/api/core";
import { homeDir } from "@tauri-apps/api/path";
import {
  Search,
  Image as ImageIcon,
  Loader2,
  Copy,
  Check,
  RefreshCw,
} from "lucide-react";

interface ManifestEntry {
  file: string;
  label: string;
  preset: string;
  domain: string;
  steps: string[];
  size: number;
  captured: string;
}

interface PresetMeta {
  description: string;
  outputs: { file: string; label: string; steps: string[] }[];
}

interface Manifest {
  updated: string;
  images: ManifestEntry[];
  presets?: Record<string, PresetMeta>;
}

interface ScreenshotFile {
  name: string;
  path: string;
  src: string;
  size: number;
  manifest?: ManifestEntry;
}

const GUIDES_IMAGES_REL = "Code/SkyNet/tv-website/public/images/guides";

export function ScreenshotsPanel() {
  const [files, setFiles] = useState<ScreenshotFile[]>([]);
  const [_manifest, setManifest] = useState<Manifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState("all");
  const [presetFilter, setPresetFilter] = useState("all");
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<ScreenshotFile | null>(null);

  const loadFiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const home = await homeDir();
      const base = home.endsWith("/") ? home : `${home}/`;
      const dirPath = `${base}${GUIDES_IMAGES_REL}`;

      let entries;
      try {
        entries = await readDir(dirPath);
      } catch (e: any) {
        throw new Error(`readDir failed: ${e?.message || e}`);
      }

      // Load manifest
      let loadedManifest: Manifest | null = null;
      try {
        const manifestText = await readTextFile(`${dirPath}/manifest.json`);
        loadedManifest = JSON.parse(manifestText);
        setManifest(loadedManifest);
      } catch {
        setManifest(null);
      }

      const manifestMap = new Map<string, ManifestEntry>();
      if (loadedManifest?.images) {
        loadedManifest.images.forEach((img) => manifestMap.set(img.file, img));
      }

      const imageFiles: ScreenshotFile[] = [];
      const now = Date.now();

      for (const entry of entries) {
        if (entry.name && /\.(png|jpg|jpeg|webp|gif)$/i.test(entry.name)) {
          const fullPath = `${dirPath}/${entry.name}`;
          const manifestEntry = manifestMap.get(entry.name);
          imageFiles.push({
            name: entry.name,
            path: fullPath,
            src: convertFileSrc(fullPath) + "?t=" + now,
            size: manifestEntry?.size ?? 0,
            manifest: manifestEntry,
          });
        }
      }

      imageFiles.sort((a, b) => a.name.localeCompare(b.name));
      setFiles(imageFiles);
    } catch (err: any) {
      setError(err?.message || "Failed to load screenshots");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, []);

  // Derive unique domains and presets from files
  const domains = useMemo(() => {
    const set = new Set<string>();
    files.forEach((f) => { if (f.manifest?.domain) set.add(f.manifest.domain); });
    return Array.from(set).sort();
  }, [files]);

  const presets = useMemo(() => {
    const set = new Set<string>();
    files.forEach((f) => { if (f.manifest?.preset) set.add(f.manifest.preset); });
    return Array.from(set).sort();
  }, [files]);

  const filtered = useMemo(() => {
    return files.filter((f) => {
      if (search) {
        const q = search.toLowerCase();
        if (!f.name.toLowerCase().includes(q) && !(f.manifest?.label ?? "").toLowerCase().includes(q)) return false;
      }
      if (domainFilter !== "all" && f.manifest?.domain !== domainFilter) return false;
      if (presetFilter !== "all" && f.manifest?.preset !== presetFilter) return false;
      return true;
    });
  }, [files, search, domainFilter, presetFilter]);

  const trackedCount = files.filter((f) => f.manifest).length;
  const untrackedCount = files.length - trackedCount;

  const copyMarkdownPath = (name: string) => {
    const md = `![](/images/guides/${name})`;
    navigator.clipboard.writeText(md);
    setCopiedPath(name);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "—";
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  // -------------------------------------------------------------------------
  // Detail view
  // -------------------------------------------------------------------------
  if (selectedFile) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex-shrink-0 border-b border-zinc-200 dark:border-zinc-800 px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedFile(null)}
              className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              &larr; Back
            </button>
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
              {selectedFile.name}
            </span>
          </div>
          <button
            onClick={() => copyMarkdownPath(selectedFile.name)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
          >
            {copiedPath === selectedFile.name ? (
              <><Check size={12} className="text-green-500" /> Copied</>
            ) : (
              <><Copy size={12} /> Copy Markdown</>
            )}
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4 bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center">
          <img
            src={selectedFile.src}
            alt={selectedFile.name}
            className="max-w-full max-h-full rounded-lg shadow-lg"
          />
        </div>
        <div className="flex-shrink-0 border-t border-zinc-200 dark:border-zinc-800 px-4 py-3">
          <div className="text-xs text-zinc-400 flex gap-4 mb-2">
            <span>{formatSize(selectedFile.size)}</span>
            <span className="font-mono text-zinc-500">/images/guides/{selectedFile.name}</span>
          </div>
          {selectedFile.manifest ? (
            <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                {selectedFile.manifest.label}
              </p>
              <div className="flex gap-2 mb-2">
                <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 rounded">
                  {selectedFile.manifest.preset}
                </span>
                <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded">
                  {selectedFile.manifest.domain}
                </span>
                <span className="text-[10px] text-zinc-400">
                  Captured {selectedFile.manifest.captured}
                </span>
              </div>
              {selectedFile.manifest.steps.length > 0 && (
                <div className="space-y-0.5">
                  <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Capture Steps</p>
                  {selectedFile.manifest.steps.map((step, i) => (
                    <p key={i} className="text-xs text-zinc-500 dark:text-zinc-400 pl-3 relative">
                      <span className="absolute left-0 text-zinc-400">{i + 1}.</span>
                      {step}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-[10px] text-zinc-400 italic mt-1">
              Not tracked in manifest — captured outside of capture.mjs presets
            </p>
          )}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Grid view
  // -------------------------------------------------------------------------
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-zinc-200 dark:border-zinc-800 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ImageIcon size={16} className="text-zinc-500" />
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              Screenshots
            </h2>
            <span className="text-xs text-zinc-400">
              ({files.length}{untrackedCount > 0 ? ` · ${untrackedCount} untracked` : ""})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadFiles}
              disabled={loading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>

        {/* Filters row */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search screenshots..."
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <select
            value={domainFilter}
            onChange={(e) => setDomainFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
          >
            <option value="all">All Domains</option>
            {domains.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <select
            value={presetFilter}
            onChange={(e) => setPresetFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
          >
            <option value="all">All Presets</option>
            {presets.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 size={20} className="animate-spin text-zinc-400" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-32 text-zinc-400 text-sm">
            <p>{error}</p>
            <p className="text-xs mt-1">Expected path: ~/Code/SkyNet/tv-website/public/images/guides/</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-zinc-400 text-sm">
            No screenshots found
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {filtered.map((file) => (
              <div
                key={file.name}
                onClick={() => setSelectedFile(file)}
                className="group cursor-pointer rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden hover:border-teal-400 dark:hover:border-teal-600 transition-colors"
              >
                <div className="aspect-video bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                  <img
                    src={file.src}
                    alt={file.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    loading="lazy"
                  />
                </div>
                <div className="px-2.5 py-2 flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">
                      {file.manifest?.label || file.name}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {file.manifest?.preset && (
                        <span className="inline-flex items-center px-1 py-0 text-[9px] font-medium bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 rounded">
                          {file.manifest.preset}
                        </span>
                      )}
                      {file.manifest?.domain && (
                        <span className="inline-flex items-center px-1 py-0 text-[9px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded">
                          {file.manifest.domain}
                        </span>
                      )}
                      {!file.manifest && (
                        <span className="text-[9px] text-zinc-400 italic">untracked</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      copyMarkdownPath(file.name);
                    }}
                    title="Copy markdown image path"
                    className="p-1 text-zinc-400 hover:text-teal-600 transition-colors rounded flex-shrink-0"
                  >
                    {copiedPath === file.name ? (
                      <Check size={12} className="text-green-500" />
                    ) : (
                      <Copy size={12} />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

