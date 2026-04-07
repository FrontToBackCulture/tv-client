// ---------------------------------------------------------------------------
// Workspace-scoped storage
//
// localStorage is shared across all windows on the same origin. To let two
// windows run different workspaces side-by-side, every workspace-scoped key
// is persisted under `${baseName}::${workspaceId}`.
//
// Each window picks its active workspace on boot from sessionStorage (which
// IS per-window), falling back to a "last used" value in localStorage for the
// first open. Workspace switches update sessionStorage and reload — they no
// longer swap bare keys.
//
// This file must be imported BEFORE any Zustand store, so stores hydrate
// against the correct workspace namespace. `main.tsx` imports it first.
// ---------------------------------------------------------------------------
//
// Bare-key migration
//
// The legacy design stored workspace-scoped values under bare keys (e.g.
// `tv-client-favorites`) and swapped their contents on workspace switch. On
// first boot after upgrading, we copy any bare-key value still lying around
// into the current workspace's namespace so nobody loses their state.
// ---------------------------------------------------------------------------

import type { StateStorage } from "zustand/middleware";

// Sentinel sessionStorage key — per-window active workspace.
const SESSION_KEY = "tv-active-workspace-id";
// Fallback localStorage key — "last used" workspace for brand-new windows.
const LAST_USED_KEY = "tv-last-used-workspace-id";
// One-time migration flag — written once we've copied bare keys across.
// Bumped to v2 after fixing the initWorkspaceScope fallback to read the
// legacy `tv-client-workspace` blob. Users whose v1 migration ran with a
// null workspace ID need their bare keys copied into the proper namespace.
const MIGRATION_FLAG = "tv-workspace-scoped-migration-v2";

/** Keys that are persisted per-workspace. Every store in this list uses
 *  `createWorkspaceScopedStorage()` as its Zustand persist `storage`. */
export const WORKSPACE_SCOPED_KEYS = [
  "tv-classification-values",
  "tv-client-activity-bar",
  "tv-client-favorites",
  "tv-client-folder-config",
  "tv-client-module-tabs",
  "tv-client-module-visibility",
  "tv-client-project-fields",
  "tv-client-recent-files",
  "tv-client-repositories",
  "tv-client-side-panel",
  "tv-client-tabs",
  "tv-client-task-fields",
  "tv-skill-types",
] as const;

/** Raw (non-Zustand) localStorage keys that are also workspace-scoped.
 *  Callers use `workspaceLocalStorage` for runtime access; this list exists
 *  so the one-time bare-key migration picks them up too. Dynamic keys
 *  (e.g. `portal_doc_id:${path}`) are NOT migrated — they were always
 *  edge-case state and aren't worth enumerating. */
export const WORKSPACE_SCOPED_RAW_KEYS = [
  "workspace-board-column-order",
  "tv-chat-pinned-threads",
  "tv-dashboard-selected-project",
  "tv-auto-briefing-last-run",
  "tv-desktop-gallery-grid-layouts",
  "tv-desktop-gallery-grid-default-layout",
] as const;

let activeWorkspaceId: string | null = null;

/** Current workspace ID as resolved at app boot. Stores use this. */
export function getActiveWorkspaceId(): string | null {
  return activeWorkspaceId;
}

/** Set the active workspace for this window. Called by workspaceStore during
 *  selectWorkspace() just before reloading. */
export function setActiveWorkspaceId(id: string): void {
  activeWorkspaceId = id;
  try {
    sessionStorage.setItem(SESSION_KEY, id);
    localStorage.setItem(LAST_USED_KEY, id);
  } catch {
    // Storage may be unavailable in some environments; fall through.
  }
}

/** Resolve the active workspace for this window. Runs automatically as a
 *  side effect at module load (see bottom of file). Exported for tests.
 *  Order: sessionStorage (per-window) → localStorage last-used → legacy
 *  `tv-client-workspace` persisted blob (for installs upgrading from the
 *  pre-scoped-storage design) → null (workspace picker). */
export function initWorkspaceScope(): void {
  try {
    const fromSession = sessionStorage.getItem(SESSION_KEY);
    if (fromSession) {
      activeWorkspaceId = fromSession;
    } else {
      const fromLocal = localStorage.getItem(LAST_USED_KEY);
      if (fromLocal) {
        activeWorkspaceId = fromLocal;
        // Seed sessionStorage so subsequent reads in this window are stable
        // even if localStorage's "last used" value is updated by another tab.
        sessionStorage.setItem(SESSION_KEY, fromLocal);
      } else {
        // Upgrade path: pre-scoped-storage installs stored the active
        // workspace inside the `tv-client-workspace` Zustand persist blob.
        // Read it directly so the very first boot after upgrading lands on
        // the user's prior workspace and migration copies bare keys into
        // the right namespace.
        const legacy = readLegacyActiveWorkspace();
        if (legacy) {
          activeWorkspaceId = legacy;
          sessionStorage.setItem(SESSION_KEY, legacy);
          localStorage.setItem(LAST_USED_KEY, legacy);
        }
      }
    }
  } catch {
    activeWorkspaceId = null;
  }

  // One-time migration: copy any bare-key values into the resolved
  // workspace's namespace, so upgraders don't lose their state.
  if (activeWorkspaceId) {
    migrateBareKeys(activeWorkspaceId);
  }
}

function readLegacyActiveWorkspace(): string | null {
  try {
    const raw = localStorage.getItem("tv-client-workspace");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { activeWorkspaceId?: string | null } };
    return parsed?.state?.activeWorkspaceId ?? null;
  } catch {
    return null;
  }
}

/** Build the namespaced localStorage key for a workspace-scoped base name. */
export function scopedKey(baseName: string, workspaceId: string | null): string {
  return workspaceId ? `${baseName}::${workspaceId}` : baseName;
}

/** Zustand `StateStorage` that auto-suffixes keys with the current workspace
 *  ID. If no workspace is active (e.g. during the workspace picker before
 *  any has been chosen), reads return null and writes are dropped — nothing
 *  useful can be persisted without a workspace anyway. */
export function createWorkspaceScopedStorage(): StateStorage {
  return {
    getItem: (name: string): string | null => {
      const wsId = activeWorkspaceId;
      if (!wsId) return null;
      try {
        return localStorage.getItem(scopedKey(name, wsId));
      } catch {
        return null;
      }
    },
    setItem: (name: string, value: string): void => {
      const wsId = activeWorkspaceId;
      if (!wsId) return;
      try {
        localStorage.setItem(scopedKey(name, wsId), value);
      } catch {
        // Quota exceeded or storage disabled — drop silently.
      }
    },
    removeItem: (name: string): void => {
      const wsId = activeWorkspaceId;
      if (!wsId) return;
      try {
        localStorage.removeItem(scopedKey(name, wsId));
      } catch {
        // ignore
      }
    },
  };
}

/** Workspace-aware helpers for raw localStorage callsites (non-Zustand).
 *  Use these instead of `localStorage.getItem`/`setItem` when the key is
 *  workspace-scoped. */
export const workspaceLocalStorage = {
  get(baseName: string): string | null {
    const wsId = activeWorkspaceId;
    if (!wsId) return null;
    try {
      return localStorage.getItem(scopedKey(baseName, wsId));
    } catch {
      return null;
    }
  },
  set(baseName: string, value: string): void {
    const wsId = activeWorkspaceId;
    if (!wsId) return;
    try {
      localStorage.setItem(scopedKey(baseName, wsId), value);
    } catch {
      // ignore
    }
  },
  remove(baseName: string): void {
    const wsId = activeWorkspaceId;
    if (!wsId) return;
    try {
      localStorage.removeItem(scopedKey(baseName, wsId));
    } catch {
      // ignore
    }
  },
};

function migrateBareKeys(workspaceId: string): void {
  try {
    if (localStorage.getItem(MIGRATION_FLAG) === "done") return;

    for (const baseName of WORKSPACE_SCOPED_KEYS) {
      const namespaced = scopedKey(baseName, workspaceId);
      // Only copy if the namespaced slot is empty — don't clobber data that
      // already exists for this workspace.
      if (localStorage.getItem(namespaced) !== null) continue;
      const bareValue = localStorage.getItem(baseName);
      if (bareValue !== null) {
        localStorage.setItem(namespaced, bareValue);
      }
    }

    // Also migrate raw (non-Zustand) scoped keys.
    for (const baseName of WORKSPACE_SCOPED_RAW_KEYS) {
      const namespaced = scopedKey(baseName, workspaceId);
      if (localStorage.getItem(namespaced) !== null) continue;
      const bareValue = localStorage.getItem(baseName);
      if (bareValue !== null) {
        localStorage.setItem(namespaced, bareValue);
      }
    }

    localStorage.setItem(MIGRATION_FLAG, "done");
  } catch {
    // If anything goes wrong, skip migration — better to run with empty
    // state than to crash on boot.
  }
}

// ---------------------------------------------------------------------------
// Side-effect init: resolve the active workspace at module load, BEFORE any
// store imports. ES module imports are evaluated depth-first before any
// statements in the importing file's body, so an explicit call from
// `main.tsx` runs too late (stores would already be hydrated with a null
// workspace). Running here guarantees that any module importing from
// `workspaceScopedStorage` triggers initialization first.
// ---------------------------------------------------------------------------
initWorkspaceScope();
