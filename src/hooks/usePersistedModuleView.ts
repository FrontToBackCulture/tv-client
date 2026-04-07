// src/hooks/usePersistedModuleView.ts
// Persists the active tab/view for a module to localStorage so reload restores position.

import { useState, useCallback, useEffect } from "react";

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

  // Listen for programmatic tab switches via custom events
  useEffect(() => {
    function onSwitch(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail?.key === key && detail?.value) {
        setViewState(detail.value as T);
      }
    }
    window.addEventListener("tv-switch-view", onSwitch);
    return () => window.removeEventListener("tv-switch-view", onSwitch);
  }, [key]);

  return [view, setView];
}
