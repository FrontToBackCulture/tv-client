// src/modules/guides/ScriptsPanel.tsx

import { useState, useEffect } from "react";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { homeDir } from "@tauri-apps/api/path";
import {
  Terminal,
  Loader2,
  ChevronDown,
  ChevronRight,
  Play,
  Image as ImageIcon,
  Copy,
  Check,
} from "lucide-react";
import { cn } from "../../lib/cn";

interface PresetOutput {
  file: string;
  label: string;
  steps: string[];
}

interface PresetMeta {
  description: string;
  outputs: PresetOutput[];
}

interface Manifest {
  updated: string;
  images: { file: string; preset: string; domain: string; captured: string }[];
  presets?: Record<string, PresetMeta>;
}

const MANIFEST_REL = "Code/SkyNet/tv-website/public/images/guides/manifest.json";

export function ScriptsPanel() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedPreset, setExpandedPreset] = useState<string | null>(null);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const home = await homeDir();
        const base = home.endsWith("/") ? home : `${home}/`;
        const text = await readTextFile(`${base}${MANIFEST_REL}`);
        setManifest(JSON.parse(text));
      } catch (e: any) {
        setError(e?.message || "Failed to load manifest");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const copyCommand = (preset: string) => {
    const cmd = `node scripts/screenshots/capture.mjs <domain> --preset ${preset}`;
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(preset);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const presets = manifest?.presets ?? {};
  const images = manifest?.images ?? [];

  // For each preset, count how many images have been captured and which domains
  const presetStats = (name: string) => {
    const matching = images.filter((img) => img.preset === name);
    const domains = [...new Set(matching.map((img) => img.domain))];
    const lastCaptured = matching.reduce((latest, img) => {
      return img.captured > latest ? img.captured : latest;
    }, "");
    return { count: matching.length, domains, lastCaptured };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 size={20} className="animate-spin text-zinc-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-zinc-400 text-sm">
        <p>{error}</p>
        <p className="text-xs mt-1">Run a capture first to generate the manifest.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-zinc-200 dark:border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <Terminal size={16} className="text-zinc-500" />
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            Capture Scripts
          </h2>
          <span className="text-xs text-zinc-400">({Object.keys(presets).length} presets)</span>
        </div>
        <p className="text-xs text-zinc-400">
          Playwright presets in <span className="font-mono">tv-client/scripts/screenshots/capture.mjs</span>
        </p>
      </div>

      {/* How to run */}
      <div className="flex-shrink-0 px-4 py-3 bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800">
        <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1">Usage</p>
        <p className="text-xs font-mono text-zinc-600 dark:text-zinc-400">
          node scripts/screenshots/capture.mjs &lt;domain&gt; --preset &lt;name&gt;
        </p>
        <p className="text-[10px] text-zinc-400 mt-1">
          Run from <span className="font-mono">tv-client/</span> directory. Default output: <span className="font-mono">tv-website/public/images/guides/</span>
        </p>
      </div>

      {/* Preset list */}
      <div className="flex-1 overflow-y-auto">
        {Object.keys(presets).length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-zinc-400 text-sm">
            No presets found in manifest
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {Object.entries(presets).map(([name, meta]) => {
              const stats = presetStats(name);
              const isExpanded = expandedPreset === name;

              return (
                <div key={name}>
                  {/* Preset header */}
                  <div
                    className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                    onClick={() => setExpandedPreset(isExpanded ? null : name)}
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown size={14} className="text-zinc-400" />
                      ) : (
                        <ChevronRight size={14} className="text-zinc-400" />
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono font-semibold text-zinc-800 dark:text-zinc-200">
                            {name}
                          </span>
                          <span className="text-[10px] text-zinc-400">
                            {meta.outputs.length} outputs
                          </span>
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                          {meta.description}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {stats.domains.length > 0 && (
                        <div className="flex gap-1">
                          {stats.domains.map((d) => (
                            <span
                              key={d}
                              className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded"
                            >
                              {d}
                            </span>
                          ))}
                        </div>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          copyCommand(name);
                        }}
                        title="Copy run command"
                        className="p-1.5 text-zinc-400 hover:text-teal-600 transition-colors rounded"
                      >
                        {copiedCmd === name ? (
                          <Check size={14} className="text-green-500" />
                        ) : (
                          <Copy size={14} />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Expanded: output details */}
                  {isExpanded && (
                    <div className="px-4 pb-3 pl-10">
                      <div className="space-y-3">
                        {meta.outputs.map((output) => {
                          const captured = images.find(
                            (img) => img.file === output.file
                          );

                          return (
                            <div
                              key={output.file}
                              className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-3"
                            >
                              <div className="flex items-start justify-between mb-1">
                                <div>
                                  <p className="text-xs font-mono font-medium text-zinc-700 dark:text-zinc-300">
                                    {output.file}
                                  </p>
                                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                    {output.label}
                                  </p>
                                </div>
                                {captured ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded">
                                    <ImageIcon size={8} />
                                    {captured.captured}
                                  </span>
                                ) : (
                                  <span className="text-[9px] text-zinc-400 italic">
                                    not captured
                                  </span>
                                )}
                              </div>

                              {/* Steps */}
                              <div className="mt-2 space-y-1">
                                {output.steps.map((step, i) => (
                                  <div
                                    key={i}
                                    className="flex items-start gap-2 text-[11px]"
                                  >
                                    <span className="text-zinc-400 font-mono w-4 flex-shrink-0 text-right">
                                      {i + 1}.
                                    </span>
                                    <span className="text-zinc-600 dark:text-zinc-400">
                                      {step}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Run command */}
                      <div className="mt-3 p-2 bg-zinc-100 dark:bg-zinc-800 rounded-md">
                        <p className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400">
                          $ node scripts/screenshots/capture.mjs &lt;domain&gt; --preset {name}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
