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
  const terminalIdRef = useRef<string | null>(null);
  const cwdRef = useRef(options.cwd);

  // Keep refs up to date
  useEffect(() => {
    onDataRef.current = options.onData;
  }, [options.onData]);

  useEffect(() => {
    cwdRef.current = options.cwd;
  }, [options.cwd]);

  // Create terminal session — stable callback (uses refs)
  const create = useCallback(
    async (rows: number = 24, cols: number = 80) => {
      try {
        const id = `term-${Date.now()}`;
        const info = await invoke<TerminalInfo>("terminal_create", {
          id,
          rows,
          cols,
          cwd: cwdRef.current,
        });
        terminalIdRef.current = info.id;
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
        }, 50);

        return info.id;
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        setError(errorMsg);
        throw e;
      }
    },
    []
  );

  // Write to terminal — stable ref, no deps on terminalId
  const write = useCallback(
    async (data: string) => {
      const id = terminalIdRef.current;
      if (!id) return;
      try {
        await invoke("terminal_write", { id, data });
      } catch (e) {
        console.error("Terminal write error:", e);
      }
    },
    []
  );

  // Resize terminal — stable ref
  const resize = useCallback(
    async (rows: number, cols: number) => {
      const id = terminalIdRef.current;
      if (!id) return;
      try {
        await invoke("terminal_resize", { id, rows, cols });
      } catch (e) {
        console.error("Terminal resize error:", e);
      }
    },
    []
  );

  // Close terminal — stable ref
  const close = useCallback(async () => {
    if (readIntervalRef.current) {
      clearInterval(readIntervalRef.current);
      readIntervalRef.current = null;
    }
    const id = terminalIdRef.current;
    if (id) {
      try {
        await invoke("terminal_close", { id });
      } catch (e) {
        console.error("Terminal close error:", e);
      }
      terminalIdRef.current = null;
      setTerminalId(null);
      setIsConnected(false);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (readIntervalRef.current) {
        clearInterval(readIntervalRef.current);
      }
      const id = terminalIdRef.current;
      if (id) {
        invoke("terminal_close", { id }).catch(console.error);
      }
    };
  }, []);

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
