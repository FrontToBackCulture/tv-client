// src/hooks/usePersistedModuleView.ts
// Persists the active tab/view for a module to localStorage so reload restores position.

import { useState, useCallback } from "react";

export function usePersistedModuleView<T extends string>(
  moduleId: string,
  defaultView: T
): [T, (view: T) => void] {
  const key = `tv-client-view-${moduleId}`;

  const [view, setViewState] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key) as T | null;
      return stored ?? defaultView;
    } catch {
      return defaultView;
    }
  });

  const setView = useCallback(
    (newView: T) => {
      try {
        localStorage.setItem(key, newView);
      } catch {
        // ignore storage errors
      }
      setViewState(newView);
    },
    [key]
  );

  return [view, setView];
}
