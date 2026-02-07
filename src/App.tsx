// src/App.tsx

import { useEffect } from "react";
import { Shell } from "./shell/Shell";
import { LibraryModule } from "./modules/library/LibraryModule";
import { WorkModule } from "./modules/work/WorkModule";
import { InboxModule } from "./modules/inbox/InboxModule";
import { CrmModule } from "./modules/crm/CrmModule";
import { BotModule } from "./modules/bot/BotModule";
import { ProductModule } from "./modules/product/ProductModule";
import { ConsoleModule } from "./modules/console/ConsoleModule";
import { SettingsModule } from "./modules/settings/SettingsModule";
import { SystemModule } from "./modules/system/SystemModule";
import { Playground } from "./playground/Playground";
import { Login } from "./components/Login";
import { useAppStore, ModuleId } from "./stores/appStore";
import { useSidePanelStore } from "./stores/sidePanelStore";
import { useAuth } from "./stores/authStore";
import { useRealtimeSync } from "./hooks/useRealtimeSync";
import { openModuleInNewWindow } from "./lib/windowManager";
import { Loader2 } from "lucide-react";

const modules: Record<ModuleId, React.ComponentType> = {
  library: LibraryModule,
  work: WorkModule,
  inbox: InboxModule,
  crm: CrmModule,
  product: ProductModule,
  bot: BotModule,
  console: ConsoleModule,
  system: SystemModule,
  settings: SettingsModule,
};

export default function App() {
  const { activeModule, setActiveModule, playgroundMode, togglePlayground } = useAppStore();
  const { user, isLoading, isInitialized, initialize } = useAuth();

  // Initialize auth on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Subscribe to Supabase Realtime for automatic UI updates (only when authenticated)
  useRealtimeSync();

  // Keyboard shortcuts: ⌘1-7 to switch modules, ⌘, for settings
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key >= "1" && e.key <= "8") {
        e.preventDefault();
        const moduleKeys: ModuleId[] = [
          "library",
          "crm",
          "work",
          "inbox",
          "product",
          "bot",
          "console",
          "system",
        ];
        setActiveModule(moduleKeys[parseInt(e.key) - 1]);
      }
      // ⌘, for settings (standard macOS shortcut)
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        setActiveModule("settings");
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
      // ⇧⌘X — Toggle playground mode
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "X" || e.key === "x")) {
        e.preventDefault();
        togglePlayground();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setActiveModule]);

  // Show loading spinner while initializing auth
  if (!isInitialized || isLoading) {
    return (
      <div className="h-screen flex flex-col bg-slate-50 dark:bg-zinc-950">
        {/* Draggable title bar */}
        <div
          data-tauri-drag-region
          className="h-10 bg-slate-100 dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 flex items-center flex-shrink-0"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <div className="w-20 flex-shrink-0" />
          <div className="flex-1 flex justify-center">
            <span className="text-xs text-zinc-500 pointer-events-none">TV Desktop</span>
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

  const ActiveModule = modules[activeModule];

  return (
    <Shell activeModule={activeModule} onModuleChange={setActiveModule}>
      {playgroundMode ? <Playground /> : <ActiveModule />}
    </Shell>
  );
}
