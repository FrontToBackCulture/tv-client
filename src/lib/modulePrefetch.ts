// Hover-prefetch for sidebar navigation. Pointer-enter on a NavButton calls
// `prefetchModule(id)` which:
//   1. Triggers the lazy chunk import (no-op if already loaded by App.tsx
//      idle prefetch).
//   2. Runs that module's data prefetch (so React Query has fresh data
//      cached by the time the user actually clicks).
//
// Modules don't need to be exhaustively registered — anything missing just
// skips the data prefetch. Prioritise heavy modules first (CRM cascade was
// the worst offender; keep adding as new bottlenecks surface).

import type { ModuleId } from "../stores/appStore";
import { queryClient } from "../main";

type Prefetcher = () => Promise<unknown>;

// Lazy chunk imports — mirror the dynamic imports in App.tsx so a hover
// triggers the same module load Vite would on first click.
const chunkImports: Partial<Record<ModuleId, Prefetcher>> = {
  crm: () => import("../modules/crm"),
  work: () => import("../modules/work"),
  projects: () => Promise.resolve(),
  inbox: () => Promise.resolve(),
  home: () => Promise.resolve(),
  library: () => import("../modules/library/LibraryModule"),
  metadata: () => import("../modules/projects/MetadataView"),
  calendar: () => import("../modules/calendar"),
  domains: () => import("../modules/domains"),
  analytics: () => import("../modules/analytics"),
  product: () => import("../modules/product/ProductModule"),
  portal: () => import("../modules/portal"),
  scheduler: () => import("../modules/scheduler"),
  repos: () => import("../modules/repos"),
  skills: () => import("../modules/skills/SkillsModule"),
  "mcp-tools": () => import("../modules/mcp-tools/McpToolsModule"),
  email: () => import("../modules/email/EmailModule"),
  gallery: () => import("../modules/gallery"),
  blog: () => import("../modules/blog"),
  guides: () => import("../modules/guides"),
  s3browser: () => import("../modules/s3-browser"),
  prospecting: () => import("../modules/prospecting"),
  "public-data": () => import("../modules/public-data/PublicDataModule"),
  chat: () => import("../modules/chat"),
  referrals: () => import("../modules/referrals/ReferralsModule"),
  investment: () => import("../modules/investment"),
  finance: () => import("../modules/finance/FinanceModule"),
  "shared-inbox": () => import("../modules/shared-inbox/SharedInboxModule"),
  settings: () => import("../modules/settings/SettingsModule"),
};

// Per-module data prefetchers. Each receives the shared queryClient and
// warms the queries that module fires on mount. Keep these resolving
// lazily — the underlying hook module is loaded on demand to avoid pulling
// every module's code into the shell bundle.
const dataPrefetchers: Partial<Record<ModuleId, Prefetcher>> = {
  crm: async () => {
    const { prefetchDealsWithTasks } = await import("../hooks/crm/useDeals");
    await prefetchDealsWithTasks(queryClient);
  },
};

// Coalesce in-flight hovers so rapid pointer enter/leave doesn't fire the
// same prefetch twice. Cleared once the prefetch resolves.
const inflight = new Map<ModuleId, Promise<void>>();

export function prefetchModule(id: ModuleId): Promise<void> {
  const cached = inflight.get(id);
  if (cached) return cached;
  const run = (async () => {
    try {
      const chunk = chunkImports[id];
      const data = dataPrefetchers[id];
      await Promise.all([chunk?.(), data?.()].filter(Boolean) as Promise<unknown>[]);
    } catch {
      // Prefetch is best-effort — never surface errors.
    } finally {
      inflight.delete(id);
    }
  })();
  inflight.set(id, run);
  return run;
}
