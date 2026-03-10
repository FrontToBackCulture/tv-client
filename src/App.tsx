// src/App.tsx

import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { Shell } from "./shell/Shell";
import { LibraryModule } from "./modules/library/LibraryModule";
import { WorkModule } from "./modules/work/WorkModule";
import { WorkspaceModule } from "./modules/workspace";
import { InboxModule } from "./modules/inbox/InboxModule";
import { CrmModule } from "./modules/crm/CrmModule";
import { BotModule } from "./modules/bot/BotModule";
import { DomainsModule } from "./modules/domains";
import { ProductModule } from "./modules/product/ProductModule";
import { PortalModule } from "./modules/portal";
import { SchedulerModule } from "./modules/scheduler";
import { ReposModule } from "./modules/repos";
import { SkillsModule } from "./modules/skills/SkillsModule";
import { EmailModule } from "./modules/email/EmailModule";
import { GalleryModule } from "./modules/gallery";
import { Login } from "./components/Login";
import { SetupWizard, isSetupComplete } from "./components/SetupWizard";
import { useAppStore, ModuleId } from "./stores/appStore";
import { useSidePanelStore } from "./stores/sidePanelStore";
import { useHelpStore } from "./stores/helpStore";
import { useAuth } from "./stores/authStore";
import { useRealtimeSync } from "./hooks/useRealtimeSync";
import { openModuleInNewWindow } from "./lib/windowManager";
import { Loader2 } from "lucide-react";

const modules: Record<ModuleId, React.ComponentType> = {
  library: LibraryModule,
  work: WorkModule,
  workspace: WorkspaceModule,
  inbox: InboxModule,
  crm: CrmModule,
  domains: DomainsModule,
  product: ProductModule,
  gallery: GalleryModule,
  bot: BotModule,
  skills: SkillsModule,
  portal: PortalModule,
  scheduler: SchedulerModule,
  repos: ReposModule,
  email: EmailModule,
};

export default function App() {
  const activeModule = useAppStore((s) => s.activeModule);
  const setActiveModule = useAppStore((s) => s.setActiveModule);
  const { user, isLoading, isInitialized, initialize } = useAuth();
  const [setupDone, setSetupDone] = useState(isSetupComplete);

  // Initialize auth on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Subscribe to Supabase Realtime for automatic UI updates (only when authenticated)
  useRealtimeSync();

  // Keyboard shortcuts: ⌘1-7 to switch modules, ⌘, for settings
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        const moduleKeys: ModuleId[] = [
          "library",
          "crm",
          "work",
          "workspace",
          "domains",
          "product",
          "gallery",
          "bot",
          "skills",
        ];
        setActiveModule(moduleKeys[parseInt(e.key) - 1]);
      }
      // ⌘, for settings (standard macOS shortcut) — toggle modal
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        const store = useAppStore.getState();
        if (store.settingsOpen) {
          store.closeSettings();
        } else {
          store.openSettings();
        }
      }
      // ⌘. — Toggle side document panel
      if ((e.metaKey || e.ctrlKey) && e.key === ".") {
        e.preventDefault();
        useSidePanelStore.getState().togglePanel();
      }
      // ⇧⌘N — Open current module in new window
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "N") {
        e.preventDefault();
        openModuleInNewWindow(useAppStore.getState().activeModule);
      }
      // ⌘/ — Toggle help panel
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        useHelpStore.getState().toggle();
      }
      // ⌘+ / ⌘= — Zoom in
      if ((e.metaKey || e.ctrlKey) && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        const current = parseFloat(localStorage.getItem("tv-zoom") || "1");
        const next = Math.min(current + 0.1, 2.0);
        localStorage.setItem("tv-zoom", String(next));
        getCurrentWebview().setZoom(next);
      }
      // ⌘- — Zoom out
      if ((e.metaKey || e.ctrlKey) && e.key === "-") {
        e.preventDefault();
        const current = parseFloat(localStorage.getItem("tv-zoom") || "1");
        const next = Math.max(current - 0.1, 0.5);
        localStorage.setItem("tv-zoom", String(next));
        getCurrentWebview().setZoom(next);
      }
      // ⌘0 — Reset zoom
      if ((e.metaKey || e.ctrlKey) && e.key === "0") {
        e.preventDefault();
        localStorage.setItem("tv-zoom", "1");
        getCurrentWebview().setZoom(1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setActiveModule]);

  // Listen for native menu events (preferences, zoom)
  useEffect(() => {
    const onPreferences = () => {
      const store = useAppStore.getState();
      if (store.settingsOpen) {
        store.closeSettings();
      } else {
        store.openSettings();
      }
    };
    const onZoom = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const current = parseFloat(localStorage.getItem("tv-zoom") || "1");
      let next = current;
      if (detail === "in") next = Math.min(current + 0.1, 2.0);
      else if (detail === "out") next = Math.max(current - 0.1, 0.5);
      else if (detail === "reset") next = 1;
      localStorage.setItem("tv-zoom", String(next));
      getCurrentWebview().setZoom(next);
    };
    window.addEventListener("menu-preferences", onPreferences);
    window.addEventListener("menu-zoom", onZoom);
    return () => {
      window.removeEventListener("menu-preferences", onPreferences);
      window.removeEventListener("menu-zoom", onZoom);
    };
  }, []);

  // Restore saved zoom level on mount
  useEffect(() => {
    const saved = parseFloat(localStorage.getItem("tv-zoom") || "1");
    if (saved !== 1) {
      getCurrentWebview().setZoom(saved);
    }
  }, []);

  // Show loading spinner while initializing auth
  if (!isInitialized || isLoading) {
    return (
      <div className="h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
        {/* Draggable title bar */}
        <div
          onMouseDown={() => getCurrentWindow().startDragging()}
          className="h-10 bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex items-center flex-shrink-0"
        >
          <div className="w-20 flex-shrink-0" />
          <div className="flex-1 flex justify-center pointer-events-none">
            <span className="text-xs text-zinc-500">TV Desktop</span>
          </div>
          <div className="w-20 flex-shrink-0" />
        </div>
        {/* Loading content */}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 size={32} className="mx-auto mb-3 text-teal-600 animate-spin" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show login page if not authenticated
  if (!user) {
    return <Login />;
  }

  // Show setup wizard on first run
  if (!setupDone) {
    return <SetupWizard onComplete={() => setSetupDone(true)} />;
  }

  const ActiveModule = modules[activeModule];

  return (
    <Shell activeModule={activeModule} onModuleChange={setActiveModule}>
      <ActiveModule />
    </Shell>
  );
}
