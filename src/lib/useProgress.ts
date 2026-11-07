// Estado global del progreso, guardado en IndexedDB del navegador.
import { useSyncExternalStore } from 'react';
import { get, set } from 'idb-keyval';
import { freshProgress, normalizeProgress, type Progress } from './progress';

const KEY = 'progress';
let state: Progress = freshProgress();
let loaded = false;
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function emit() {
  for (const l of listeners) l();
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    set(KEY, state).catch((e) => console.error('No se pudo guardar el progreso', e));
  }, 300);
}

export async function loadProgress(): Promise<void> {
  try {
    const raw = await get(KEY);
    if (raw) state = normalizeProgress(raw);
  } catch (e) {
    console.error('No se pudo leer el progreso guardado', e);
  }
  loaded = true;
  emit();
}

export function getProgress(): Progress {
  return state;
}

export function updateProgress(fn: (p: Progress) => Progress): void {
  state = fn(state);
  emit();
  scheduleSave();
}

export function replaceProgress(p: Progress): void {
  state = p;
  emit();
  scheduleSave();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useProgress(): Progress {
  return useSyncExternalStore(subscribe, () => state);
}

export function useProgressLoaded(): boolean {
  return useSyncExternalStore(subscribe, () => loaded);
}

// Guarda de inmediato si la app pasa a segundo plano (en el celular puede cerrarse sin aviso).
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && loaded) {
      clearTimeout(saveTimer);
      set(KEY, state).catch(() => {});
    }
  });
}
