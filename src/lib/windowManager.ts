// src/lib/windowManager.ts

import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { ModuleId } from "../stores/appStore";

let windowCounter = 0;

const moduleLabels: Record<ModuleId, string> = {
  library: "Library",
  work: "Work",
  inbox: "Inbox",
  crm: "CRM",
  product: "Product",
  bot: "Bots",
  console: "Console",
  settings: "Settings",
};

export function openModuleInNewWindow(moduleId: ModuleId) {
  windowCounter++;
  const label = `module-${moduleId}-${windowCounter}`;
  const title = `TV Desktop — ${moduleLabels[moduleId]}`;

  const webview = new WebviewWindow(label, {
    url: `?module=${moduleId}`,
    title,
    width: 1400,
    height: 900,
    decorations: false,
    transparent: false,
    center: true,
  });

  webview.once("tauri://error", (e) => {
    console.error(`Failed to create window ${label}:`, e);
  });

  return webview;
}
