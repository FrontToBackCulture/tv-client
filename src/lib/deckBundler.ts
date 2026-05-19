// src/lib/deckBundler.ts
// Turn a deck HTML that links external files into ONE self-contained HTML:
// every relative stylesheet inlined as <style>, every relative image/asset
// (incl. url(...) inside CSS) inlined as a base64 data URI.
//
// Structure-AGNOSTIC: the user picks the deck's .html file; every relative
// ref is resolved against THAT file's own directory, any depth, any folder
// names. No _shared/assets convention assumed. Mirrors
// tv-website/scripts/bundle-and-upload-decks.mjs.

import { invoke } from "@tauri-apps/api/core";

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  ico: "image/x-icon",
  avif: "image/avif",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
};

const isRemote = (u: string) => /^(https?:|data:|#|mailto:|tel:)/i.test(u);

/** Relative src/href refs left in the HTML (these would 404 as a lone file). */
export function findUnbundledRefs(html: string): string[] {
  const refs = new Set<string>();
  for (const m of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    if (!isRemote(m[1])) refs.add(m[1]);
  }
  for (const m of html.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    if (!isRemote(m[1])) refs.add(m[1]);
  }
  return [...refs];
}

/** Resolve a relative path against an absolute base dir (handles ./ and ../). */
function resolveRel(baseDir: string, rel: string): string {
  const clean = rel.split("?")[0].split("#")[0];
  const parts = baseDir.split("/");
  for (const seg of clean.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

const dirOf = (p: string) => p.split("/").slice(0, -1).join("/");
const extOf = (p: string) =>
  p.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase() ?? "";

async function dataUri(absPath: string, ref: string): Promise<string> {
  let b64: string;
  try {
    b64 = await invoke<string>("read_file_binary", { path: absPath });
  } catch {
    throw new Error(
      `Asset not found: "${ref}" (looked at ${absPath}). It's linked by the deck but missing on disk.`,
    );
  }
  return `data:${MIME[extOf(ref)] ?? "application/octet-stream"};base64,${b64}`;
}

/** Inline relative url(...) refs inside a CSS string, resolved from cssDir. */
async function inlineCssUrls(css: string, cssDir: string): Promise<string> {
  const refs = new Set<string>();
  for (const m of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    if (!isRemote(m[1])) refs.add(m[1]);
  }
  for (const ref of refs) {
    const uri = await dataUri(resolveRel(cssDir, ref), ref);
    css = css.replace(
      new RegExp(`url\\(\\s*["']?${ref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']?\\s*\\)`, "g"),
      `url(${uri})`,
    );
  }
  return css;
}

export interface BundleResult {
  html: string;
  imageCount: number;
  leftover: string[];
}

/**
 * Bundle the deck at `htmlPath` into a single self-contained HTML string.
 * Throws with a precise message naming any link that can't be resolved.
 */
export async function bundleDeckHtml(htmlPath: string): Promise<BundleResult> {
  let html: string;
  try {
    html = await invoke<string>("read_file", { path: htmlPath });
  } catch {
    throw new Error(`Could not read ${htmlPath}`);
  }
  const htmlDir = dirOf(htmlPath);

  // 1. Inline every relative stylesheet <link> (skip https / preconnect).
  for (const tag of [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0])) {
    const rel = /rel\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1] ?? "";
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1] ?? "";
    if (!/stylesheet/i.test(rel) || !href || isRemote(href)) continue;
    const cssPath = resolveRel(htmlDir, href);
    let css: string;
    try {
      css = await invoke<string>("read_file", { path: cssPath });
    } catch {
      throw new Error(
        `Stylesheet not found: "${href}" (looked at ${cssPath}). Pick the deck's real .html so its linked files resolve.`,
      );
    }
    css = await inlineCssUrls(css, dirOf(cssPath));
    html = html.replace(tag, `<style>\n${css}\n</style>`);
  }

  // 2. Inline relative url(...) inside any inline <style> blocks.
  for (const block of [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]) {
    const inlined = await inlineCssUrls(block[1], htmlDir);
    if (inlined !== block[1]) html = html.replace(block[1], inlined);
  }

  // 3. Base64 every relative src/href asset.
  let imageCount = 0;
  for (const ref of findUnbundledRefs(html)) {
    const uri = await dataUri(resolveRel(htmlDir, ref), ref);
    html = html.split(`"${ref}"`).join(`"${uri}"`);
    html = html.split(`'${ref}'`).join(`'${uri}'`);
    imageCount++;
  }

  return { html, imageCount, leftover: findUnbundledRefs(html) };
}
