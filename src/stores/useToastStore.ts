import { create } from 'zustand';
import type { Toast, ToastType } from '@/types';

interface ToastStore {
  toasts: Toast[];
  addToast: (type: ToastType, message: string, duration?: number) => void;
  removeToast: (id: string) => void;
}

function generateId(): string {
  return crypto.randomUUID();
}

function getDefaultDuration(type: ToastType): number {
  switch (type) {
    case 'error':
    case 'warning':
      return 6000;
    case 'success':
    case 'info':
    default:
      return 4000;
  }
}

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],

  addToast: (type: ToastType, message: string, duration?: number) => {
    const id = generateId();
    const resolvedDuration = duration ?? getDefaultDuration(type);

    const toast: Toast = { id, type, message, duration: resolvedDuration };
    set({ toasts: [...get().toasts, toast] });

    setTimeout(() => {
      get().removeToast(id);
    }, resolvedDuration);
  },

  removeToast: (id: string) => {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));
