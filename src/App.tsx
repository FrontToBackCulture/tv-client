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
const MetadataModule = lazy(() => import("./modules/projects/MetadataView").then(m => ({
  default: () => <div className="h-full flex flex-col bg-white dark:bg-zinc-950"><div className="flex-1 overflow-hidden"><m.MetadataView /></div></div>,
})));
const CalendarModule = lazy(() => import("./modules/calendar").then(m => ({ default: m.CalendarModule })));
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
const ProspectingModule = lazy(() => import("./modules/prospecting").then(m => ({ default: m.ProspectingModule })));
const PublicDataModule = lazy(() => import("./modules/public-data/PublicDataModule").then(m => ({ default: m.PublicDataModule })));
const ChatModule = lazy(() => import("./modules/chat").then(m => ({ default: m.ChatModule })));
const ReferralsModule = lazy(() => import("./modules/referrals/ReferralsModule").then(m => ({ default: m.ReferralsModule })));
const InvestmentModule = lazy(() => import("./modules/investment").then(m => ({ default: m.InvestmentModule })));
const SharedInboxModule = lazy(() => import("./modules/shared-inbox/SharedInboxModule").then(m => ({ default: m.SharedInboxModule })));
const SettingsModule = lazy(() => import("./modules/settings/SettingsModule").then(m => ({ default: m.SettingsModule })));
import { Login } from "./components/Login";
import { WorkspacePicker } from "./components/WorkspacePicker";
import { SetupWizard, isSetupComplete } from "./components/SetupWizard";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore, ModuleId } from "./stores/appStore";
import {
  useModuleTabStore,
  useActiveTab,
  useActiveTabs,
} from "./stores/moduleTabStore";
import { useModeStore } from "./stores/modeStore";
import type { Mode } from "./config/modes";
import { useRepositoryStore } from "./stores/repositoryStore";
import { useModuleVisibilityStore } from "./stores/moduleVisibilityStore";
import { useSidePanelStore } from "./stores/sidePanelStore";
import { useHelpStore } from "./stores/helpStore";
import { useAuth } from "./stores/authStore";
import { useTeamConfigStore } from "./stores/teamConfigStore";
import { useWorkspaceStore } from "./stores/workspaceStore";
import { useRealtimeSync } from "./hooks/useRealtimeSync";
import { openModuleInNewWindow } from "./lib/windowManager";
import { initWorkspaceClient, isWorkspaceClientReady } from "./lib/supabase";
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
  skills: SkillsModule,
  portal: PortalModule,
  scheduler: SchedulerModule,
  repos: ReposModule,
  email: EmailModule,
  blog: BlogModule,
  guides: GuidesModule,
  s3browser: S3BrowserModule,
  prospecting: ProspectingModule,
  "public-data": PublicDataModule,
  referrals: ReferralsModule,
  investment: InvestmentModule,
  "shared-inbox": SharedInboxModule,
  settings: SettingsModule,
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
  // Tabs are per-mode — these hooks resolve to the currently-active mode's
  // slice, so a mode switch re-renders the shell with the right tab set.
  const openTabs = useActiveTabs();
  const activeTab = useActiveTab();
  const openTab = useModuleTabStore((s) => s.openTab);
  const activeMode = useModeStore((s) => s.activeMode);
  const setMode = useModeStore((s) => s.setMode);
  const { user, isLoading, isInitialized, initialize } = useAuth();
  const loadTeamConfig = useTeamConfigStore((s) => s.loadConfig);
  const registerCurrentUser = useTeamConfigStore((s) => s.registerCurrentUser);
  const wsWorkspaces = useWorkspaceStore((s) => s.workspaces);
  const wsActiveId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const wsSelect = useWorkspaceStore((s) => s.selectWorkspace);
  const wsLoad = useWorkspaceStore((s) => s.loadWorkspaces);
  const [setupDone, setSetupDone] = useState(isSetupComplete);
  const [workspaceReady, setWorkspaceReady] = useState(false);

  // Keep appStore.activeModule in sync with the current mode's active tab.
  // Tabs are now per-mode, so we derive the active tab from both stores and
  // re-sync on either change.
  useEffect(() => {
    const sync = () => {
      const mode = useModeStore.getState().activeMode;
      const tab = useModuleTabStore.getState().activeTabByMode[mode];
      if (!tab) return;
      const current = useAppStore.getState().activeModule;
      if (current !== tab) {
        useAppStore.getState().setActiveModule(tab);
      }
    };
    sync();
    const unsubTabs = useModuleTabStore.subscribe(sync);
    const unsubMode = useModeStore.subscribe(sync);
    return () => {
      unsubTabs();
      unsubMode();
    };
  }, []);

  // Initialize auth on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Load workspaces from gateway after auth succeeds.
  // The gateway client has an active Supabase Auth session after login,
  // so the RLS-filtered query will return this user's workspaces.
  useEffect(() => {
    if (user) {
      wsLoad();
    }
  }, [user, wsLoad]);

  // Initialize workspace Supabase client from Tauri settings.
  // This reads the stored supabase_url + supabase_anon_key and creates the
  // dynamic client before any hooks try to query Supabase.
  // After client init, mints a workspace JWT for authenticated RLS access.
  useEffect(() => {
    if (!user) return;
    if (isWorkspaceClientReady()) {
      // Client exists but may need a fresh workspace token
      const wsStore = useWorkspaceStore.getState();
      if (wsStore.activeWorkspaceId && !wsStore.workspaceToken) {
        wsStore.refreshWorkspaceToken();
      }
      setWorkspaceReady(true);
      return;
    }
    (async () => {
      try {
        // Multi-window safety: prefer the per-window active workspace (via
        // sessionStorage + workspaceStore in-memory data) over the shared
        // settings.json file. Two windows in different workspaces share one
        // settings.json, so reading `supabase_url`/`supabase_anon_key` from
        // it is last-writer-wins and silently corrupts the other window.
        // workspaceStore has the workspaces list in localStorage (persist)
        // and activeWorkspaceId in sessionStorage (per-window), so each
        // window can independently resolve its correct credentials.
        const wsStore = useWorkspaceStore.getState();
        const activeWs = wsStore.workspaces.find(
          (w) => w.id === wsStore.activeWorkspaceId,
        );

        if (activeWs?.supabaseUrl && activeWs?.supabaseAnonKey) {
          initWorkspaceClient(activeWs.supabaseUrl, activeWs.supabaseAnonKey);
          if (!wsStore.workspaceToken) {
            await wsStore.refreshWorkspaceToken();
          }
          setWorkspaceReady(true);
          return;
        }

        // Fallback: no active workspace yet (fresh install, first launch,
        // or workspaces list not hydrated). Fall through to the legacy
        // settings.json path so the app can still boot.
        const [url, anonKey] = await invoke<[string | null, string | null]>(
          "settings_get_supabase_credentials",
        );
        if (url && anonKey) {
          initWorkspaceClient(url, anonKey);

          // Mint workspace JWT if we have an active workspace
          if (wsStore.activeWorkspaceId) {
            await wsStore.refreshWorkspaceToken();
          }

          setWorkspaceReady(true);
        }
      } catch (err) {
        console.error("Failed to initialize workspace Supabase client:", err);
      }
    })();
  }, [user]);

  // Auto-refresh workspace token before it expires (every 50 minutes)
  useEffect(() => {
    if (!workspaceReady) return;
    const interval = setInterval(() => {
      useWorkspaceStore.getState().refreshWorkspaceToken();
    }, 50 * 60 * 1000);
    return () => clearInterval(interval);
  }, [workspaceReady]);

  // Initialize team config after auth + workspace client is ready
  useEffect(() => {
    if (user && workspaceReady) {
      loadTeamConfig().then(() => registerCurrentUser());
    }
  }, [user, workspaceReady, loadTeamConfig, registerCurrentUser]);

  // Auto-briefing: generate feed cards from system activity on load + interval
  useAutoBriefing();

  // Task advisor: bot-mel check-ins via chat on load + every 2 hours
  useTaskAdvisor();

  // Redirect to first visible module if active module is hidden.
  // Uses `ignoreMode: true` so cross-mode tabs (explicitly opened via
  // shortcut or deep link) aren't force-closed on every mode switch — the
  // mode filter only reshapes the sidebar, not the tab list.
  const isModuleVisible = useModuleVisibilityStore((s) => s.isModuleVisible);
  const teamConfigLoaded = useTeamConfigStore((s) => s.isLoaded);
  useEffect(() => {
    if (!teamConfigLoaded) return;
    if (!isModuleVisible(activeTab, { ignoreMode: true })) {
      const allModuleIds: ModuleId[] = ["home", "library", "projects", "metadata", "work", "inbox", "calendar", "chat", "crm", "domains", "product", "gallery", "skills", "portal", "scheduler", "repos", "email", "blog", "s3browser", "referrals"];
      const firstVisible = allModuleIds.find((id) => isModuleVisible(id, { ignoreMode: true }));
      if (firstVisible) {
        openTab(firstVisible);
      }
    }
  }, [activeTab, isModuleVisible, teamConfigLoaded, openTab]);

  // Auto-switch non-admin users out of `all` mode once team config loads.
  // Admins keep whatever was persisted (they usually land in `all`).
  useEffect(() => {
    if (!teamConfigLoaded || !user) return;
    const isAdmin = useTeamConfigStore.getState().isAdmin(user.login);
    if (activeMode === "all" && !isAdmin) {
      setMode("sell");
    }
  }, [teamConfigLoaded, user, activeMode, setMode]);

  // Sync active mode + active tab to URL query params so deep links and
  // refresh-in-place work. `history.replaceState` is fine inside the Tauri
  // webview — no React Router needed.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.set("mode", activeMode);
    params.set("module", activeTab);
    const qs = params.toString();
    const target = `${window.location.pathname}?${qs}${window.location.hash}`;
    if (window.location.search !== `?${qs}`) {
      window.history.replaceState({}, "", target);
    }
  }, [activeMode, activeTab]);

  // Sync active repository path to backend settings.json (knowledge_path)
  const activeRepoId = useRepositoryStore((s) => s.activeRepositoryId);
  const repositories = useRepositoryStore((s) => s.repositories);
  useEffect(() => {
    const activeRepo = repositories.find((r) => r.id === activeRepoId);
    const path = activeRepo?.path ?? "";
    invoke("settings_set_key", { keyName: "knowledge_path", value: path }).catch(() => {});
  }, [activeRepoId, repositories]);

  // Auto-heal: if repositoryStore is empty (e.g. cleared localStorage) but
  // settings.json still has a knowledge_path, re-register it so views like
  // VAL Credentials, MCP Endpoints, and Library don't silently break. The
  // underlying folder is still on disk — only the pointer was lost.
  // Runs once after the workspace client is ready (so workspace-scoped
  // storage is hydrated).
  useEffect(() => {
    if (!workspaceReady) return;
    if (repositories.length > 0) return;
    (async () => {
      try {
        const path = await invoke<string | null>("settings_get_key", { keyName: "knowledge_path" });
        if (!path || !path.trim()) return;
        // Double-check nothing else added a repo in the meantime.
        if (useRepositoryStore.getState().repositories.length > 0) return;
        const name = path.split("/").filter(Boolean).pop() ?? "Repository";
        useRepositoryStore.getState().addRepository(name, path);
      } catch {
        // Silent — nothing stored, or backend call failed. User can still
        // recover via the in-app NoRepositoryEmptyState affordance.
      }
    })();
  }, [workspaceReady, repositories.length]);

  // Subscribe to Supabase Realtime for automatic UI updates (only when authenticated)
  useRealtimeSync();

  // Keyboard shortcuts: ⌘1-7 to switch modules, ⌘W to close tab, ⌘, for settings
  // Mode switching: ⌘⇧1 Sell, ⌘⇧2 Support, ⌘⇧3 Marketing, ⌘⇧0 All (admin)
  useEffect(() => {
    const modeShortcuts: Record<string, Mode> = {
      Digit1: "sell",
      Digit2: "support",
      Digit3: "marketing",
      Digit0: "all",
    };
    const handler = (e: KeyboardEvent) => {
      // Mode shortcut (⌘⇧ + digit) — checked first so it beats the plain
      // ⌘ + digit handler for the same keys.
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && modeShortcuts[e.code]) {
        e.preventDefault();
        const target = modeShortcuts[e.code];
        if (target === "all") {
          const u = useAuth.getState().user;
          const admin = u ? useTeamConfigStore.getState().isAdmin(u.login) : false;
          if (!admin) return;
        }
        useModeStore.getState().setMode(target);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        const moduleKeys: ModuleId[] = [
          "projects",
          "library",
          "domains",
          "product",
          "metadata",
          "gallery",
          "skills",
          "scheduler",
        ];
        openTab(moduleKeys[parseInt(e.key) - 1]);
      }
      // ⌘W to close active tab (within current mode)
      if ((e.metaKey || e.ctrlKey) && e.key === "w" && !e.shiftKey) {
        e.preventDefault();
        const mode = useModeStore.getState().activeMode;
        const tabStore = useModuleTabStore.getState();
        const currentTabs = tabStore.tabsByMode[mode] ?? [];
        const currentActive = tabStore.activeTabByMode[mode];
        if (currentTabs.length > 1 && currentActive) {
          tabStore.closeTab(currentActive);
        }
      }
      // ⌘, for settings (standard macOS shortcut) — open settings tab
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        const mode = useModeStore.getState().activeMode;
        const tabStore = useModuleTabStore.getState();
        const currentTabs = tabStore.tabsByMode[mode] ?? [];
        const currentActive = tabStore.activeTabByMode[mode];
        if (currentActive === "settings" && currentTabs.length > 1) {
          tabStore.closeTab("settings");
        } else {
          tabStore.openTab("settings");
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
      const mode = useModeStore.getState().activeMode;
      const tabStore = useModuleTabStore.getState();
      const currentTabs = tabStore.tabsByMode[mode] ?? [];
      const currentActive = tabStore.activeTabByMode[mode];
      if (currentActive === "settings" && currentTabs.length > 1) {
        tabStore.closeTab("settings");
      } else {
        tabStore.openTab("settings");
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

  // Show loading spinner while initializing auth or workspace
  if (!isInitialized || isLoading || (user && !workspaceReady)) {
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

  // Show workspace picker when multiple workspaces exist and none is selected.
  // This is only active once the gateway is configured and workspaces are loaded.
  if (wsWorkspaces.length > 1 && !wsActiveId) {
    return <WorkspacePicker workspaces={wsWorkspaces} onSelect={wsSelect} />;
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
