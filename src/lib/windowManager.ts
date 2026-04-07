// src/lib/windowManager.ts

import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { ModuleId } from "../stores/appStore";

let windowCounter = 0;

const moduleLabels: Record<ModuleId, string> = {
  home: "Home",
  library: "Library",
  projects: "Projects",
  metadata: "Metadata",
  work: "Work",
  inbox: "Inbox",
  calendar: "Calendar",
  chat: "Chat",
  crm: "CRM",
  domains: "Domains",
  analytics: "Analytics",
  product: "Product",
  gallery: "Gallery",
  skills: "Skills",
  portal: "Portal",
  scheduler: "Scheduler",
  repos: "Repos",
  email: "EDM",
  blog: "Blog",
  guides: "Guides",
  s3browser: "S3 Browser",
  prospecting: "Outbound",
  "public-data": "Public Data",
  referrals: "Referrals",
  investment: "Investment",
  "shared-inbox": "Shared Inboxes",
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
    minWidth: 1000,
    minHeight: 600,
    decorations: true,
    titleBarStyle: "overlay",
    hiddenTitle: true,
    transparent: false,
    center: true,
  });

  webview.once("tauri://error", (e) => {
    console.error(`Failed to create window ${label}:`, e);
  });

  return webview;
}
