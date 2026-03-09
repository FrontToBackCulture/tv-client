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

  // Track latest scene state via onChange — getSceneElements() can be stale
  const latestElements = useRef<unknown[]>([]);
  const latestAppState = useRef<Record<string, unknown>>({});
  const latestFiles = useRef<Record<string, unknown>>({});

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
      const elements = data.elements || [];
      const appState = data.appState || {};
      const files = data.files || {};
      setInitialData({ elements, appState, files });
      // Seed refs with initial data
      latestElements.current = elements;
      latestAppState.current = appState;
      latestFiles.current = files;
    } catch {
      // Invalid JSON
    }
  }, [content]);

  // onChange fires on every scene mutation — capture latest state
  const handleChange = useCallback((elements: unknown[], appState: Record<string, unknown>) => {
    latestElements.current = elements;
    latestAppState.current = appState;
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const fileData = {
        type: "excalidraw",
        version: 2,
        source: "tv-desktop",
        elements: latestElements.current,
        appState: {
          viewBackgroundColor: (latestAppState.current.viewBackgroundColor as string) || "#ffffff",
          gridSize: latestAppState.current.gridSize,
        },
        files: latestFiles.current,
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
            // Capture files ref from API since onChange doesn't provide files
            const typedApi = api as { getFiles: () => Record<string, unknown>; scrollToContent: () => void };
            latestFiles.current = typedApi.getFiles?.() || {};
            setTimeout(() => {
              try { typedApi.scrollToContent(); } catch { /* ignore */ }
            }, 100);
          }}
          initialData={initialData}
          onChange={handleChange}
          theme="light"
        />
      </div>
    </div>
  );
}
