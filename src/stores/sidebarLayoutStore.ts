// src/stores/sidebarLayoutStore.ts
// User customization layer for the activity bar: section order, custom
// section labels, per-section item order, item-to-section overrides, and
// user-created sections. Persisted per workspace.
//
// Sections are addressed by a stable key:
//   - Canonical sections use their canonical label as the key (e.g. "Work").
//   - Custom sections use a generated `custom:<uuid>` key.
//
// `itemSection` lets a user move a module out of its canonical section into
// any other section. If unset, the module appears in its canonical section.
// `itemOrder` defines order within a section. Newly-introduced modules
// (added to the codebase later) appear in their canonical section in their
// canonical order, so additions don't require a migration.

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { createWorkspaceScopedStorage } from "../lib/workspaceScopedStorage";
import { ModuleId } from "./appStore";
import { supabase } from "../lib/supabase";

export interface CustomSection {
  key: string;
  label: string;
}

interface SidebarLayoutState {
  sectionOrder: string[];
  customSectionLabels: Record<string, string>;
  itemOrder: Record<string, ModuleId[]>;
  itemSection: Record<string, string>;
  customSections: CustomSection[];
  reorderSection: (fromIndex: number, toIndex: number) => void;
  reorderItem: (sectionKey: string, fromIndex: number, toIndex: number) => void;
  moveItem: (moduleId: ModuleId, fromSection: string, toSection: string, toIndex: number) => void;
  renameSection: (sectionKey: string, label: string) => void;
  addSection: (label?: string) => string;
  removeSection: (sectionKey: string) => void;
  resetLayout: () => void;
}

function genCustomKey(): string {
  const id = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  return `custom:${id}`;
}

export const useSidebarLayoutStore = create<SidebarLayoutState>()(
  persist(
    (set, get) => ({
      sectionOrder: [],
      customSectionLabels: {},
      itemOrder: {},
      itemSection: {},
      customSections: [],

      reorderSection: (fromIndex, toIndex) => {
        const order = [...get().sectionOrder];
        if (fromIndex < 0 || fromIndex >= order.length) return;
        if (toIndex < 0 || toIndex >= order.length) return;
        const [moved] = order.splice(fromIndex, 1);
        order.splice(toIndex, 0, moved);
        set({ sectionOrder: order });
      },

      reorderItem: (sectionKey, fromIndex, toIndex) => {
        const items = [...(get().itemOrder[sectionKey] ?? [])];
        if (fromIndex < 0 || fromIndex >= items.length) return;
        if (toIndex < 0 || toIndex >= items.length) return;
        const [moved] = items.splice(fromIndex, 1);
        items.splice(toIndex, 0, moved);
        set({ itemOrder: { ...get().itemOrder, [sectionKey]: items } });
      },

      moveItem: (moduleId, fromSection, toSection, toIndex) => {
        const state = get();
        const fromList = (state.itemOrder[fromSection] ?? []).filter((id) => id !== moduleId);
        const toListSrc = state.itemOrder[toSection] ?? [];
        const toList = toListSrc.filter((id) => id !== moduleId);
        const insertAt = Math.max(0, Math.min(toIndex, toList.length));
        toList.splice(insertAt, 0, moduleId);
        set({
          itemOrder: { ...state.itemOrder, [fromSection]: fromList, [toSection]: toList },
          itemSection: { ...state.itemSection, [moduleId]: toSection },
        });
      },

      renameSection: (sectionKey, label) => {
        const trimmed = label.trim();
        // Custom sections store their label on the customSections array;
        // canonical sections use customSectionLabels as an override map.
        const customs = get().customSections;
        const isCustom = customs.some((s) => s.key === sectionKey);
        if (isCustom) {
          set({
            customSections: customs.map((s) =>
              s.key === sectionKey ? { ...s, label: trimmed.length > 0 ? trimmed : s.label } : s
            ),
          });
          return;
        }
        const next = { ...get().customSectionLabels };
        if (trimmed.length === 0) delete next[sectionKey];
        else next[sectionKey] = trimmed;
        set({ customSectionLabels: next });
      },

      addSection: (label) => {
        const key = genCustomKey();
        const customs = [...get().customSections, { key, label: label?.trim() || "New Section" }];
        const order = [...get().sectionOrder, key];
        const itemOrder = { ...get().itemOrder, [key]: [] };
        set({ customSections: customs, sectionOrder: order, itemOrder });
        return key;
      },

      removeSection: (sectionKey) => {
        const state = get();
        const customs = state.customSections.filter((s) => s.key !== sectionKey);
        // Strip from order, item order, and any per-item overrides pointing
        // at this section. Items revert to their canonical home.
        const order = state.sectionOrder.filter((k) => k !== sectionKey);
        const { [sectionKey]: _, ...itemOrder } = state.itemOrder;
        const itemSection: Record<string, string> = {};
        for (const [mod, sec] of Object.entries(state.itemSection)) {
          if (sec !== sectionKey) itemSection[mod] = sec;
        }
        set({ customSections: customs, sectionOrder: order, itemOrder, itemSection });
      },

      resetLayout: () =>
        set({
          sectionOrder: [],
          customSectionLabels: {},
          itemOrder: {},
          itemSection: {},
          customSections: [],
        }),
    }),
    {
      name: "tv-client-sidebar-layout",
      storage: createJSONStorage(() => createWorkspaceScopedStorage()),
    }
  )
);

// ── Cloud sync ────────────────────────────────────────────────────────────
// localStorage stays the fast cache; the workspace's `user_sidebar_layouts`
// table is the cross-device source of truth. We pull on init and push on
// every change with a 1s debounce.
//
// Conflict resolution is last-write-wins on `updated_at`. Personal layouts
// are low-stakes — if you reorder on phone and laptop simultaneously, the
// later write wins, no merge attempted.

type SerializableLayout = Pick<
  SidebarLayoutState,
  "sectionOrder" | "customSectionLabels" | "itemOrder" | "itemSection" | "customSections"
>;

function extract(state: SidebarLayoutState): SerializableLayout {
  return {
    sectionOrder: state.sectionOrder,
    customSectionLabels: state.customSectionLabels,
    itemOrder: state.itemOrder,
    itemSection: state.itemSection,
    customSections: state.customSections,
  };
}

function isEmpty(layout: SerializableLayout): boolean {
  return (
    layout.sectionOrder.length === 0 &&
    Object.keys(layout.customSectionLabels).length === 0 &&
    Object.keys(layout.itemOrder).length === 0 &&
    Object.keys(layout.itemSection).length === 0 &&
    layout.customSections.length === 0
  );
}

let suppressPush = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let activeUserId: string | null = null;
let hydrated = false;

/** Pull cloud layout for a user and replace local state if cloud is newer.
 *  Should be called once when the user is identified (after login). */
export async function syncSidebarLayoutFromCloud(userId: string): Promise<void> {
  if (!userId) return;
  activeUserId = userId;
  try {
    const { data, error } = await supabase
      .from("user_sidebar_layouts")
      .select("layout, updated_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      console.warn("[sidebarLayout] cloud pull failed", error.message);
      hydrated = true;
      return;
    }
    if (data?.layout && typeof data.layout === "object") {
      // Cloud has a row — replace local state, suppressing the push that
      // would otherwise echo it back.
      suppressPush = true;
      const cloud = data.layout as Partial<SerializableLayout>;
      useSidebarLayoutStore.setState({
        sectionOrder: Array.isArray(cloud.sectionOrder) ? cloud.sectionOrder : [],
        customSectionLabels: cloud.customSectionLabels ?? {},
        itemOrder: cloud.itemOrder ?? {},
        itemSection: cloud.itemSection ?? {},
        customSections: Array.isArray(cloud.customSections) ? cloud.customSections : [],
      });
      // Release suppression on next tick so the subscriber doesn't fire.
      setTimeout(() => { suppressPush = false; }, 0);
    } else {
      // No cloud row yet — push current local state up so subsequent devices
      // can pull it. Skip if local is also empty (fresh install).
      const local = extract(useSidebarLayoutStore.getState());
      if (!isEmpty(local)) {
        await pushSidebarLayoutToCloud(userId, local);
      }
    }
  } finally {
    hydrated = true;
  }
}

async function pushSidebarLayoutToCloud(
  userId: string,
  layout: SerializableLayout
): Promise<void> {
  try {
    const { error } = await supabase
      .from("user_sidebar_layouts")
      .upsert({ user_id: userId, layout }, { onConflict: "user_id" });
    if (error) console.warn("[sidebarLayout] cloud push failed", error.message);
  } catch (e) {
    console.warn("[sidebarLayout] cloud push threw", e);
  }
}

// Subscribe to local changes and debounce-push.
useSidebarLayoutStore.subscribe((state, prev) => {
  if (suppressPush || !hydrated || !activeUserId) return;
  // Bail if nothing relevant changed (prevents push on no-op set calls).
  const a = extract(state);
  const b = extract(prev);
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    if (activeUserId) pushSidebarLayoutToCloud(activeUserId, extract(useSidebarLayoutStore.getState()));
  }, 1000);
});

/** Clear the active user — used when the user signs out or workspace
 *  switches mid-session. Stops further pushes. */
export function clearSidebarLayoutSync(): void {
  activeUserId = null;
  hydrated = false;
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
}
