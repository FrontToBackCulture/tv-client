// src/stores/toastStore.ts

import { create } from "zustand";

export type ToastType = "success" | "error" | "info" | "warning";

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration: number;
}

interface ToastState {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
}

let nextId = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = String(++nextId);
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, toast.duration);
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
};
