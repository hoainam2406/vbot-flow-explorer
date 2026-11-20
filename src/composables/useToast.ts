// src/composables/useToast.ts
import { ref } from 'vue';

export type ToastVariant = 'success' | 'info' | 'error';

export interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

const toasts = ref<ToastItem[]>([]);
let nextToastId = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export function dismissToast(id: number): void {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
  toasts.value = toasts.value.filter((item) => item.id !== id);
}

export function pushToast(
  message: string,
  variant: ToastVariant = 'success',
  durationMs = 2200,
): number {
  const id = nextToastId++;
  const next = [...toasts.value, { id, message, variant }];
  if (next.length > 3) {
    const dropped = next.shift();
    if (dropped) {
      const t = timers.get(dropped.id);
      if (t) clearTimeout(t);
      timers.delete(dropped.id);
    }
  }
  toasts.value = next;

  const timer = setTimeout(() => {
    dismissToast(id);
  }, durationMs);
  timers.set(id, timer);
  return id;
}

export function useToast() {
  return {
    toasts,
    pushToast,
    dismissToast,
  };
}
