// src/modules/gallery/ExcalidrawEditor.tsx
// Interactive Excalidraw editor with save support

import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, ChevronRight, Save } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../../components/ui";
import { useReadFile } from "../../hooks/useFiles";
import type { GalleryItem } from "./useGallery";

export function ExcalidrawEditor({ item, onBack }: { item: GalleryItem; onBack: () => void }) {
  const { data: content } = useReadFile(item.file_path);
  const [ExcalidrawComp, setExcalidrawComp] = useState<React.ComponentType<Record<string, unknown>> | null>(null);
  const [initialData, setInitialData] = useState<{ elements: unknown[]; appState: Record<string, unknown>; files: Record<string, unknown> } | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const excalidrawAPI = useRef<any>(null);

  // Load excalidraw component + CSS dynamically
  useEffect(() => {
    Promise.all([
      import("@excalidraw/excalidraw"),
      import("@excalidraw/excalidraw/index.css"),
    ]).then(([mod]) => {
      setExcalidrawComp(() => mod.Excalidraw);
    });
  }, []);

  // Parse initial data from file
  useEffect(() => {
    if (!content) return;
    try {
      const data = JSON.parse(content);
      setInitialData({
        elements: data.elements || [],
        appState: data.appState || {},
        files: data.files || {},
      });
    } catch {
      // Invalid JSON
    }
  }, [content]);

  const handleSave = useCallback(async () => {
    const api = excalidrawAPI.current;
    if (!api) return;

    setSaving(true);
    try {
      const elements = api.getSceneElements();
      const appState = api.getAppState();
      const files = api.getFiles();

      const fileData = {
        type: "excalidraw",
        version: 2,
        source: "tv-desktop",
        elements,
        appState: {
          viewBackgroundColor: appState.viewBackgroundColor || "#ffffff",
          gridSize: appState.gridSize,
        },
        files,
      };

      await invoke("write_file", {
        path: item.file_path,
        content: JSON.stringify(fileData, null, 2),
      });

      setLastSaved(new Date().toLocaleTimeString());
    } catch (err) {
      console.error("Failed to save excalidraw:", err);
    } finally {
      setSaving(false);
    }
  }, [item.file_path]);

  // Cmd+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        e.stopPropagation();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [handleSave]);

  if (!ExcalidrawComp || !initialData) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            icon={ChevronRight}
            onClick={onBack}
            className="[&_svg:first-child]:rotate-180"
          >
            Back
          </Button>
          <div>
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{item.file_name}</h2>
            <p className="text-xs text-zinc-400">{item.folder}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastSaved && <span className="text-xs text-zinc-400">Saved {lastSaved}</span>}
          <Button
            size="md"
            icon={Save}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <ExcalidrawComp
          excalidrawAPI={(api: unknown) => {
            excalidrawAPI.current = api;
            setTimeout(() => {
              try { (api as { scrollToContent: (opts?: unknown) => void }).scrollToContent(); } catch { /* ignore */ }
            }, 100);
          }}
          initialData={initialData}
          theme="light"
        />
      </div>
    </div>
  );
}
