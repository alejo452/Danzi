// Estado global del progreso, guardado en IndexedDB del navegador.
import { useSyncExternalStore } from 'react';
import { get, set, setMany } from 'idb-keyval';
import { freshProgress, normalizeProgress, type Progress } from './progress';

const KEY = 'progress';
let state: Progress = freshProgress();
let loaded = false;
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let markReady: () => void = () => {};

/** Se cumple cuando el progreso guardado ya se leyó (antes, getProgress devuelve un progreso vacío). */
export const progressReady = new Promise<void>((ok) => (markReady = ok));

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
  markReady();
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

/**
 * Guarda el progreso de inmediato junto con otros valores, en una sola operación: quedan todos o ninguno.
 * La sincronización guarda así el progreso y la versión de la nube de la que sale.
 */
export function saveProgressWith(entries: [IDBValidKey, unknown][]): Promise<void> {
  if (!loaded) return Promise.reject(new Error('El progreso todavía no se ha leído.'));
  clearTimeout(saveTimer);
  return setMany([[KEY, state], ...entries]);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Avisa cada vez que cambia el progreso. Devuelve la función para dejar de escuchar. */
export function onProgressChange(cb: () => void): () => void {
  return subscribe(cb);
}

export function useProgress(): Progress {
  return useSyncExternalStore(subscribe, () => state);
}

export function useProgressLoaded(): boolean {
  return useSyncExternalStore(subscribe, () => loaded);
}

// Guarda de inmediato si la app pasa a segundo plano (en el celular puede cerrarse sin aviso).
// En la APK, Capacitor avisa con el evento «pause», porque visibilitychange puede no llegar.
if (typeof document !== 'undefined') {
  const saveNow = () => {
    if (!loaded) return;
    clearTimeout(saveTimer);
    set(KEY, state).catch(() => {});
  };
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && saveNow());
  document.addEventListener('pause', saveNow);
}
