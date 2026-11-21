import { create } from 'zustand';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';
export type ToastPosition = 'bottom-right' | 'top-right';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
  position?: ToastPosition;
  action?: ToastAction;
  durationMs?: number;
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
      toasts: [...state.toasts.slice(-4), { ...toast, id }],
    }));

    const duration = toast.durationMs ?? 4500;
    if (typeof window !== 'undefined' && duration > 0) {
      window.setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((item) => item.id !== id),
        }));
      }, duration);
    }

    return id;
  },
  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((item) => item.id !== id),
    })),
}));
