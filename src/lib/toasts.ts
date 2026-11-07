// Avisos cortos que aparecen sobre la barra inferior y se van solos.
import { useSyncExternalStore } from 'react';

export type Toast = { id: number; text: string };

let list: Toast[] = [];
let next = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(text: string, ms = 4000): void {
  const t = { id: next++, text };
  list = [...list, t].slice(-3);
  emit();
  setTimeout(() => {
    list = list.filter((x) => x.id !== t.id);
    emit();
  }, ms);
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => list,
  );
}
