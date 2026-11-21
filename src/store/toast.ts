import { create } from 'zustand';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
}

interface ToastStoreState {
  toasts: ToastItem[];
  showToast: (toast: Omit<ToastItem, 'id'>) => string;
  dismissToast: (id: string) => void;
}

export const useToastStore = create<ToastStoreState>((set) => ({
  toasts: [],
  showToast: (toast) => {
    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    set((state) => ({
      toasts: [...state.toasts.slice(-3), { ...toast, id }],
    }));

    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((item) => item.id !== id),
        }));
      }, 4500);
    }

    return id;
  },
  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((item) => item.id !== id),
    })),
}));
