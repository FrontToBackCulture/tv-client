// ---------------------------------------------------------------------------
// Workspace-scoped localStorage helper
//
// When switching workspaces, we need to save the current workspace's
// localStorage state and restore the new workspace's state. The Zustand
// stores themselves don't change — they read from their normal keys. We just
// swap what's stored under those keys before the page reloads.
// ---------------------------------------------------------------------------

/** localStorage keys that differ per workspace. */
export const WORKSPACE_SCOPED_KEYS = [
  "tv-client-module-tabs",
  "tv-client-module-visibility",
  "tv-client-project-fields",
  "tv-client-task-fields",
  "tv-classification-values",
  "tv-client-favorites",
  "tv-client-tabs",
  "tv-client-recent-files",
  "tv-client-folder-config",
  "tv-skill-types",
];

/**
 * Save current localStorage state under namespaced keys for the old workspace,
 * then load the new workspace's state into the standard keys.
 */
export function switchLocalStorage(
  oldWorkspaceId: string | null,
  newWorkspaceId: string,
): void {
  for (const baseName of WORKSPACE_SCOPED_KEYS) {
    // Save current state for the old workspace
    if (oldWorkspaceId) {
      const current = localStorage.getItem(baseName);
      if (current !== null) {
        localStorage.setItem(`${baseName}::${oldWorkspaceId}`, current);
      }
    }

    // Load state for the new workspace (or clear if none exists)
    const saved = localStorage.getItem(`${baseName}::${newWorkspaceId}`);
    if (saved !== null) {
      localStorage.setItem(baseName, saved);
    } else {
      localStorage.removeItem(baseName);
    }
  }
}

/**
 * One-time migration: when upgrading from the pre-workspace app, existing
 * localStorage data has no namespace suffix. Copy it to the ThinkVAL workspace
 * namespace so it's preserved on future switches.
 */
export function migrateExistingLocalStorage(thinkvalWorkspaceId: string): void {
  for (const baseName of WORKSPACE_SCOPED_KEYS) {
    const namespacedKey = `${baseName}::${thinkvalWorkspaceId}`;
    // Only migrate if the namespaced key doesn't exist yet
    if (localStorage.getItem(namespacedKey) === null) {
      const existing = localStorage.getItem(baseName);
      if (existing !== null) {
        localStorage.setItem(namespacedKey, existing);
      }
    }
  }
}
