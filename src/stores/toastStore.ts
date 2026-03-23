// src/stores/toastStore.ts

import { create } from "zustand";

export type ToastType = "success" | "error" | "info" | "warning" | "loading";

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration: number;
}

interface ToastState {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => string;
  updateToast: (id: string, updates: Partial<Omit<Toast, "id">>) => void;
  removeToast: (id: string) => void;
}

let nextId = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = String(++nextId);
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    if (toast.type !== "loading") {
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
      }, toast.duration);
    }
    return id;
  },
  updateToast: (id, updates) => {
    set((s) => ({
      toasts: s.toasts.map((t) => {
        if (t.id !== id) return t;
        const updated = { ...t, ...updates };
        // If changing from loading to a dismissable type, schedule removal
        if (t.type === "loading" && updates.type && updates.type !== "loading") {
          setTimeout(() => {
            set((s2) => ({ toasts: s2.toasts.filter((t2) => t2.id !== id) }));
          }, updated.duration);
        }
        return updated;
      }),
    }));
  },
  removeToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

// Convenience functions — import and call directly from anywhere
export const toast = {
  success: (message: string, duration = 3000) =>
    useToastStore.getState().addToast({ type: "success", message, duration }),
  error: (message: string, duration = 5000) =>
    useToastStore.getState().addToast({ type: "error", message, duration }),
  info: (message: string, duration = 3000) =>
    useToastStore.getState().addToast({ type: "info", message, duration }),
  warning: (message: string, duration = 4000) =>
    useToastStore.getState().addToast({ type: "warning", message, duration }),
  loading: (message: string) =>
    useToastStore.getState().addToast({ type: "loading", message, duration: 0 }),
  update: (id: string, updates: Partial<Omit<Toast, "id">>) =>
    useToastStore.getState().updateToast(id, updates),
  dismiss: (id: string) =>
    useToastStore.getState().removeToast(id),
};
