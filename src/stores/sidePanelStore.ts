// src/stores/sidePanelStore.ts
// Side document panel state — opens a read-only file viewer alongside Work/CRM/Inbox

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SidePanelState {
  isOpen: boolean;
  filePath: string | null;
  fileName: string | null;
  panelWidth: number;
  isPickerOpen: boolean;

  openPanel: (path: string, name: string) => void;
  closePanel: () => void;
  togglePanel: () => void;
  setPanelWidth: (width: number) => void;
  openPicker: () => void;
  closePicker: () => void;
}

const MIN_WIDTH = 300;
const MAX_WIDTH = 800;
const DEFAULT_WIDTH = 420;

function clampWidth(w: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w));
}

export const useSidePanelStore = create<SidePanelState>()(
  persist(
    (set, get) => ({
      isOpen: false,
      filePath: null,
      fileName: null,
      panelWidth: DEFAULT_WIDTH,
      isPickerOpen: false,

      openPanel: (path, name) =>
        set({ isOpen: true, filePath: path, fileName: name, isPickerOpen: false }),

      closePanel: () =>
        set({ isOpen: false, isPickerOpen: false }),

      togglePanel: () => {
        const { isOpen, filePath } = get();
        if (isOpen) {
          set({ isOpen: false, isPickerOpen: false });
        } else if (filePath) {
          set({ isOpen: true });
        } else {
          // No file yet — open with picker
          set({ isOpen: true, isPickerOpen: true });
        }
      },

      setPanelWidth: (width) =>
        set({ panelWidth: clampWidth(width) }),

      openPicker: () =>
        set({ isPickerOpen: true }),

      closePicker: () =>
        set({ isPickerOpen: false }),
    }),
    {
      name: "tv-desktop-side-panel",
      partialize: (state) => ({
        filePath: state.filePath,
        fileName: state.fileName,
        panelWidth: state.panelWidth,
      }),
    }
  )
);
