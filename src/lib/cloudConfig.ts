// Configuración de la sincronización, sin cargar Supabase: la usan App.tsx y Ajustes para saber si mostrarla.
// El código que habla con Supabase está en src/lib/cloud.ts y se carga aparte, solo cuando hace falta.

/** Proyecto de Supabase (supabase/config.json). */
export const CLOUD = __DANZI_NUBE__;

/** Si la app tiene un proyecto de Supabase configurado. Sin él no se muestra la sincronización. */
export const cloudConfigured = CLOUD.url !== '' && CLOUD.key !== '';

/** Dónde guarda Supabase la sesión en este dispositivo (localStorage). */
export const SESSION_KEY = 'danzi-sesion';

/** Si en este dispositivo hay una sesión guardada: solo entonces se carga Supabase al abrir la app. */
export function hasStoredSession(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(SESSION_KEY) !== null;
  } catch {
    return false;
  }
}
