// src/hooks/useCollapsiblePanel.ts
// Shared hook for collapsible left panels — persists collapsed state to localStorage

import { useState, useCallback } from "react";

export function useCollapsiblePanel(storageKey: string, defaultCollapsed = false) {
  const [collapsed, setCollapsedRaw] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === "true";
    } catch {
      return defaultCollapsed;
    }
  });

  const setCollapsed = useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    setCollapsedRaw((prev) => {
      const next = typeof v === "function" ? v(prev) : v;
      try {
        localStorage.setItem(storageKey, String(next));
      } catch {}
      return next;
    });
  }, [storageKey]);

  const toggle = useCallback(() => setCollapsed((prev) => !prev), [setCollapsed]);

  return { collapsed, setCollapsed, toggle };
}
