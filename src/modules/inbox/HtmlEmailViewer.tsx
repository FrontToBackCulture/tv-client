// Sandboxed iframe HTML email renderer
// - Strips scripts and event handlers for security
// - Injects dark mode base styles
// - Auto-resizes to content height
// - Intercepts link clicks -> open in default browser

import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-shell";

interface HtmlEmailViewerProps {
  html: string;
  className?: string;
}

// Strip dangerous content from HTML
function sanitizeHtml(html: string): string {
  // Remove script tags
  let clean = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  // Remove on* event attributes
  clean = clean.replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi, "");
  // Remove javascript: URLs
  clean = clean.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"');
  return clean;
}

// Base styles injected into the iframe for consistent rendering
const BASE_STYLES = `
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.6;
    color: #1a1a1a;
    margin: 0;
    padding: 0;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  img { max-width: 100%; height: auto; }
  a { color: #0d9488; }
  table { max-width: 100%; }
  pre, code { white-space: pre-wrap; word-break: break-all; }
  blockquote {
    border-left: 3px solid #d4d4d8;
    margin: 8px 0;
    padding: 4px 12px;
    color: #52525b;
  }
  @media (prefers-color-scheme: dark) {
    body { color: #e4e4e7; background: transparent; }
    a { color: #5eead4; }
    blockquote { border-left-color: #3f3f46; color: #a1a1aa; }
  }
</style>
`;

export function HtmlEmailViewer({ html, className }: HtmlEmailViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(400);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !html) return;

    const sanitized = sanitizeHtml(html);
    const doc = `<!DOCTYPE html><html><head><meta charset="utf-8">${BASE_STYLES}</head><body>${sanitized}</body></html>`;

    // Write content to iframe
    const iframeDoc = iframe.contentDocument;
    if (!iframeDoc) return;

    iframeDoc.open();
    iframeDoc.write(doc);
    iframeDoc.close();

    // Auto-resize
    const resize = () => {
      const body = iframeDoc.body;
      if (body) {
        const newHeight = Math.max(body.scrollHeight, 200);
        setHeight(newHeight + 20);
      }
    };

    // Resize after content loads (images, etc.)
    resize();
    const timer = setTimeout(resize, 500);
    const timer2 = setTimeout(resize, 2000);

    // Intercept link clicks -> open in default browser
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest("a");
      if (anchor) {
        e.preventDefault();
        const href = anchor.getAttribute("href");
        if (href && !href.startsWith("#")) {
          open(href).catch(console.error);
        }
      }
    };

    iframeDoc.addEventListener("click", handleClick);

    return () => {
      clearTimeout(timer);
      clearTimeout(timer2);
      iframeDoc.removeEventListener("click", handleClick);
    };
  }, [html]);

  if (!html) {
    return (
      <div className="text-zinc-400 italic py-4">No content available</div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-same-origin"
      className={className}
      style={{
        width: "100%",
        height: `${height}px`,
        border: "none",
        background: "transparent",
      }}
      title="Email content"
    />
  );
}
