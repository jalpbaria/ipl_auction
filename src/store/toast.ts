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
  metaText?: string;
  teamCode?: string;
  leftBorderRed?: boolean;
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

    set((state) => {
      const targetPos: ToastPosition = toast.position ?? 'bottom-right';
      if (targetPos === 'top-right') {
        const currentTop = state.toasts.filter((t) => t.position === 'top-right');
        const currentBottom = state.toasts.filter((t) => t.position !== 'top-right');
        const nextTop = [{ ...toast, id }, ...currentTop].slice(0, 4);
        return { toasts: [...nextTop, ...currentBottom] };
      }

      const currentTop = state.toasts.filter((t) => t.position === 'top-right');
      const currentBottom = state.toasts.filter((t) => t.position !== 'top-right');
      const nextBottom = [...currentBottom.slice(-3), { ...toast, id }];
      return { toasts: [...currentTop, ...nextBottom] };
    });

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
