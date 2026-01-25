// src/modules/console/Terminal.tsx
// Terminal component using xterm.js

import { useEffect, useRef, useCallback } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { useTerminal } from "../../hooks/useTerminal";
import "@xterm/xterm/css/xterm.css";

interface TerminalProps {
  id: string;
  cwd?: string;
  onClose?: () => void;
  isActive?: boolean;
}

export function Terminal({ id: _id, cwd, onClose: _onClose, isActive = true }: TerminalProps) {
  // _id is used as React key prop by parent
  // _onClose reserved for future use
  void _id; void _onClose;
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  // Handle incoming terminal data
  const handleData = useCallback((data: string) => {
    if (xtermRef.current) {
      xtermRef.current.write(data);
    }
  }, []);

  const { error, create, write, resize, close } = useTerminal({
    onData: handleData,
    cwd,
  });

  // Initialize xterm
  useEffect(() => {
    if (!containerRef.current) return;

    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"JetBrains Mono", "SF Mono", Monaco, "Cascadia Code", monospace',
      lineHeight: 1.2,
      theme: {
        background: "#1a1918",
        foreground: "#ecebea",
        cursor: "#0d7d85",
        cursorAccent: "#1a1918",
        selectionBackground: "#3d3b39",
        selectionForeground: "#ecebea",
        black: "#1a1918",
        red: "#e42513",
        green: "#039649",
        yellow: "#f5c72c",
        blue: "#2364b9",
        magenta: "#6b4ea1",
        cyan: "#0d7d85",
        white: "#ecebea",
        brightBlack: "#64625f",
        brightRed: "#f87171",
        brightGreen: "#6fbf82",
        brightYellow: "#fbbf24",
        brightBlue: "#72a1e0",
        brightMagenta: "#a395c9",
        brightCyan: "#5eafb4",
        brightWhite: "#f6f5f4",
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(webLinksAddon);

    xterm.open(containerRef.current);
    fitAddon.fit();

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // Handle user input
    xterm.onData((data) => {
      write(data);
    });

    // Handle resize
    xterm.onResize(({ rows, cols }) => {
      resize(rows, cols);
    });

    // Create terminal session
    const rows = xterm.rows;
    const cols = xterm.cols;
    create(rows, cols);

    // Handle window resize
    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      xterm.dispose();
      close();
    };
  }, [create, write, resize, close, cwd]);

  // Re-fit when tab becomes active
  useEffect(() => {
    if (isActive && fitAddonRef.current) {
      setTimeout(() => {
        fitAddonRef.current?.fit();
        xtermRef.current?.focus();
      }, 100);
    }
  }, [isActive]);

  // Focus terminal when clicked
  const handleClick = useCallback(() => {
    xtermRef.current?.focus();
  }, []);

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-zinc-900 text-red-400">
        <div className="text-center">
          <p className="mb-2">Failed to create terminal</p>
          <p className="text-sm text-zinc-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      className="h-full w-full bg-[#1a1918] p-2"
      style={{ minHeight: "200px" }}
    />
  );
}
