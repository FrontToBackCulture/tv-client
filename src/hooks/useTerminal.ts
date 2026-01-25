// src/hooks/useTerminal.ts
// Hook for managing terminal sessions via Tauri

import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface TerminalInfo {
  id: string;
  rows: number;
  cols: number;
}

interface UseTerminalOptions {
  onData?: (data: string) => void;
  cwd?: string;
}

export function useTerminal(options: UseTerminalOptions = {}) {
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const readIntervalRef = useRef<number | null>(null);
  const onDataRef = useRef(options.onData);

  // Keep onData callback up to date
  useEffect(() => {
    onDataRef.current = options.onData;
  }, [options.onData]);

  // Create terminal session
  const create = useCallback(
    async (rows: number = 24, cols: number = 80) => {
      try {
        const id = `term-${Date.now()}`;
        const info = await invoke<TerminalInfo>("terminal_create", {
          id,
          rows,
          cols,
          cwd: options.cwd,
        });
        setTerminalId(info.id);
        setIsConnected(true);
        setError(null);

        // Start reading output
        readIntervalRef.current = window.setInterval(async () => {
          try {
            const data = await invoke<string>("terminal_read", { id: info.id });
            if (data && onDataRef.current) {
              onDataRef.current(data);
            }
          } catch (e) {
            console.error("Terminal read error:", e);
          }
        }, 50); // Read every 50ms

        return info.id;
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        setError(errorMsg);
        throw e;
      }
    },
    [options.cwd]
  );

  // Write to terminal
  const write = useCallback(
    async (data: string) => {
      if (!terminalId) return;
      try {
        await invoke("terminal_write", { id: terminalId, data });
      } catch (e) {
        console.error("Terminal write error:", e);
      }
    },
    [terminalId]
  );

  // Resize terminal
  const resize = useCallback(
    async (rows: number, cols: number) => {
      if (!terminalId) return;
      try {
        await invoke("terminal_resize", { id: terminalId, rows, cols });
      } catch (e) {
        console.error("Terminal resize error:", e);
      }
    },
    [terminalId]
  );

  // Close terminal
  const close = useCallback(async () => {
    if (readIntervalRef.current) {
      clearInterval(readIntervalRef.current);
      readIntervalRef.current = null;
    }
    if (terminalId) {
      try {
        await invoke("terminal_close", { id: terminalId });
      } catch (e) {
        console.error("Terminal close error:", e);
      }
      setTerminalId(null);
      setIsConnected(false);
    }
  }, [terminalId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (readIntervalRef.current) {
        clearInterval(readIntervalRef.current);
      }
      if (terminalId) {
        invoke("terminal_close", { id: terminalId }).catch(console.error);
      }
    };
  }, [terminalId]);

  return {
    terminalId,
    isConnected,
    error,
    create,
    write,
    resize,
    close,
  };
}

// Hook to list active terminals
export function useTerminalList() {
  const [terminals, setTerminals] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    try {
      const list = await invoke<string[]>("terminal_list");
      setTerminals(list);
    } catch (e) {
      console.error("Failed to list terminals:", e);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { terminals, refresh };
}
