// src/App.tsx

import { useEffect, useState, lazy, Suspense } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { Shell } from "./shell/Shell";
import { useAutoBriefing } from "./hooks/feed";
import { useTaskAdvisor } from "./hooks/chat";

// Core modules (loaded eagerly — most likely first screen)
import { HomeModule } from "./modules/home/HomeModule";
import { ProjectsModule } from "./modules/projects";
import { InboxModule } from "./modules/inbox/InboxModule";

// Lazy-loaded modules (loaded on first navigate — keeps initial bundle small)
const LibraryModule = lazy(() => import("./modules/library/LibraryModule").then(m => ({ default: m.LibraryModule })));
const MetadataModule = lazy(() => import("./modules/metadata").then(m => ({ default: m.MetadataModule })));
const CalendarModule = lazy(() => import("./modules/calendar").then(m => ({ default: m.CalendarModule })));
const BotModule = lazy(() => import("./modules/bot/BotModule").then(m => ({ default: m.BotModule })));
const DomainsModule = lazy(() => import("./modules/domains").then(m => ({ default: m.DomainsModule })));
const AnalyticsModule = lazy(() => import("./modules/analytics").then(m => ({ default: m.AnalyticsModule })));
const ProductModule = lazy(() => import("./modules/product/ProductModule").then(m => ({ default: m.ProductModule })));
const PortalModule = lazy(() => import("./modules/portal").then(m => ({ default: m.PortalModule })));
const SchedulerModule = lazy(() => import("./modules/scheduler").then(m => ({ default: m.SchedulerModule })));
const ReposModule = lazy(() => import("./modules/repos").then(m => ({ default: m.ReposModule })));
const SkillsModule = lazy(() => import("./modules/skills/SkillsModule").then(m => ({ default: m.SkillsModule })));
const EmailModule = lazy(() => import("./modules/email/EmailModule").then(m => ({ default: m.EmailModule })));
const GalleryModule = lazy(() => import("./modules/gallery").then(m => ({ default: m.GalleryModule })));
const BlogModule = lazy(() => import("./modules/blog").then(m => ({ default: m.BlogModule })));
const GuidesModule = lazy(() => import("./modules/guides").then(m => ({ default: m.GuidesModule })));
const S3BrowserModule = lazy(() => import("./modules/s3-browser").then(m => ({ default: m.S3BrowserModule })));
const LinkedInModule = lazy(() => import("./modules/linkedin/LinkedInModule").then(m => ({ default: m.LinkedInModule })));
const ProspectingModule = lazy(() => import("./modules/prospecting").then(m => ({ default: m.ProspectingModule })));
const PublicDataModule = lazy(() => import("./modules/public-data/PublicDataModule").then(m => ({ default: m.PublicDataModule })));
const ChatModule = lazy(() => import("./modules/chat").then(m => ({ default: m.ChatModule })));
const ReferralsModule = lazy(() => import("./modules/referrals/ReferralsModule").then(m => ({ default: m.ReferralsModule })));
import { Login } from "./components/Login";
import { SetupWizard, isSetupComplete } from "./components/SetupWizard";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore, ModuleId } from "./stores/appStore";
import { useModuleTabStore } from "./stores/moduleTabStore";
import { useRepositoryStore } from "./stores/repositoryStore";
import { useModuleVisibilityStore } from "./stores/moduleVisibilityStore";
import { useSidePanelStore } from "./stores/sidePanelStore";
import { useHelpStore } from "./stores/helpStore";
import { useAuth } from "./stores/authStore";
import { useTeamConfigStore } from "./stores/teamConfigStore";
import { useRealtimeSync } from "./hooks/useRealtimeSync";
import { openModuleInNewWindow } from "./lib/windowManager";
import { Loader2 } from "lucide-react";
import { ListSkeleton } from "./components/ui/Skeleton";

const modules: Record<ModuleId, React.ComponentType> = {
  home: HomeModule,
  library: LibraryModule,
  projects: ProjectsModule,
  metadata: MetadataModule,
  work: ProjectsModule,
  inbox: InboxModule,
  calendar: CalendarModule,
  chat: ChatModule,
  crm: ProjectsModule,
  domains: DomainsModule,
  analytics: AnalyticsModule,
  product: ProductModule,
  gallery: GalleryModule,
  bot: BotModule,
  skills: SkillsModule,
  portal: PortalModule,
  scheduler: SchedulerModule,
  repos: ReposModule,
  email: EmailModule,
  blog: BlogModule,
  guides: GuidesModule,
  s3browser: S3BrowserModule,
  linkedin: LinkedInModule,
  prospecting: ProspectingModule,
  "public-data": PublicDataModule,
  referrals: ReferralsModule,
};

// Force hard reload when app version changes (clears stale webview cache)
const CACHE_BUST_KEY = "tv-client-cache-bust-version";
(function cacheBust() {
  const current = __APP_VERSION__;
  const last = localStorage.getItem(CACHE_BUST_KEY);
  if (last && last !== current) {
    localStorage.setItem(CACHE_BUST_KEY, current);
    // Force reload to pick up new assets — only runs once per version change
    window.location.reload();
    return;
  }
  localStorage.setItem(CACHE_BUST_KEY, current);
})();

export default function App() {
  const openTabs = useModuleTabStore((s) => s.tabs);
  const activeTab = useModuleTabStore((s) => s.activeTab);
  const openTab = useModuleTabStore((s) => s.openTab);
  const { user, isLoading, isInitialized, initialize } = useAuth();
  const loadTeamConfig = useTeamConfigStore((s) => s.loadConfig);
  const registerCurrentUser = useTeamConfigStore((s) => s.registerCurrentUser);
  const [setupDone, setSetupDone] = useState(isSetupComplete);

  // Keep appStore.activeModule in sync with tab store (for keyboard shortcuts, window title, etc.)
  useEffect(() => {
    return useModuleTabStore.subscribe((state) => {
      const current = useAppStore.getState().activeModule;
      if (current !== state.activeTab) {
        useAppStore.getState().setActiveModule(state.activeTab);
      }
    });
  }, []);

  // Initialize auth on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Initialize team config after auth
  useEffect(() => {
    if (user) {
      loadTeamConfig().then(() => registerCurrentUser());
    }
  }, [user, loadTeamConfig, registerCurrentUser]);

  // Auto-briefing: generate feed cards from system activity on load + interval
  useAutoBriefing();

  // Task advisor: bot-mel check-ins via chat on load + every 2 hours
  useTaskAdvisor();

  // Redirect to first visible module if active module is hidden
  const isModuleVisible = useModuleVisibilityStore((s) => s.isModuleVisible);
  const teamConfigLoaded = useTeamConfigStore((s) => s.isLoaded);
  useEffect(() => {
    if (!teamConfigLoaded) return;
    if (!isModuleVisible(activeTab)) {
      const allModuleIds: ModuleId[] = ["home", "library", "projects", "metadata", "work", "inbox", "calendar", "chat", "crm", "domains", "product", "gallery", "bot", "skills", "portal", "scheduler", "repos", "email", "blog", "s3browser", "linkedin", "referrals"];
      const firstVisible = allModuleIds.find((id) => isModuleVisible(id));
      if (firstVisible) {
        openTab(firstVisible);
      }
    }
  }, [activeTab, isModuleVisible, teamConfigLoaded, openTab]);

  // Sync active repository path to backend settings.json (knowledge_path)
  const activeRepoId = useRepositoryStore((s) => s.activeRepositoryId);
  const repositories = useRepositoryStore((s) => s.repositories);
  useEffect(() => {
    const activeRepo = repositories.find((r) => r.id === activeRepoId);
    const path = activeRepo?.path ?? "";
    invoke("settings_set_key", { keyName: "knowledge_path", value: path }).catch(() => {});
  }, [activeRepoId, repositories]);

  // Subscribe to Supabase Realtime for automatic UI updates (only when authenticated)
  useRealtimeSync();

  // Keyboard shortcuts: ⌘1-7 to switch modules, ⌘W to close tab, ⌘, for settings
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        const moduleKeys: ModuleId[] = [
          "projects",
          "library",
          "domains",
          "product",
          "metadata",
          "gallery",
          "bot",
          "skills",
          "scheduler",
        ];
        openTab(moduleKeys[parseInt(e.key) - 1]);
      }
      // ⌘W to close active tab
      if ((e.metaKey || e.ctrlKey) && e.key === "w" && !e.shiftKey) {
        e.preventDefault();
        const tabStore = useModuleTabStore.getState();
        if (tabStore.tabs.length > 1) {
          tabStore.closeTab(tabStore.activeTab);
        }
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
  }, [openTab]);

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

  return (
    <Shell activeModule={activeTab} onModuleChange={openTab}>
      {openTabs.map((tabId) => {
        const Module = modules[tabId];
        return (
          <div
            key={tabId}
            className="h-full"
            style={{ display: tabId === activeTab ? "block" : "none" }}
          >
            <Suspense
              fallback={
                <div className="flex-1 flex items-center justify-center">
                  <ListSkeleton rows={8} />
                </div>
              }
            >
              <Module />
            </Suspense>
          </div>
        );
      })}
    </Shell>
  );
}
