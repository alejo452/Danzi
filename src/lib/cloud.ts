// Sincronización con Supabase: la cuenta (código por correo) y cuándo sincronizar. Qué subir y qué bajar lo decide
// src/lib/cloudSync.ts. Este archivo se carga aparte (import()), solo si hay un proyecto configurado y una sesión
// guardada, o cuando la persona pide el código en Ajustes.
//
// Cuándo se sincroniza, con la sesión iniciada:
// - Al abrir la app y al volver a ella (si no se acaba de hacer), y al volver el internet.
// - Al salir de la app, si hay cambios sin subir.
// - Después de practicar, cuando pasan 30 segundos sin cambios.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { del, get } from 'idb-keyval';
import {
  authErrorMessage,
  clearPendingCode,
  CLOUD,
  getCloudState,
  isOfflineError,
  savePendingCode,
  SESSION_KEY,
  setCloudState,
  storedSession,
  syncErrorMessage,
} from './cloudConfig';
import { normalizeMeta, syncProgress, type SyncBackend, type SyncMeta } from './cloudSync';
import type { Progress } from './progress';
import { toast } from './toasts';
import { getProgress, onProgressChange, progressReady, replaceProgress, saveProgressWith } from './useProgress';

/** Lo que este dispositivo recuerda de la última sincronización (IndexedDB, fuera de Progress). */
const META_KEY = 'sincronizacion';
/** La tabla de supabase/schema.sql. */
const TABLE = 'progreso';
/** Después de un cambio se espera a que la persona deje de practicar un rato antes de subirlo. */
const AFTER_CHANGE_MS = 30_000;
/** Al volver a la app no se pregunta a la nube si se acaba de sincronizar. */
const MIN_PULL_MS = 20_000;

let client: SupabaseClient | null = null;

function supabase(): SupabaseClient {
  client ??= createClient(CLOUD.url, CLOUD.key, {
    auth: {
      storageKey: SESSION_KEY,
      persistSession: true,
      autoRefreshToken: true,
      // La app usa el # de la dirección para las pestañas; la sesión nunca llega por ahí.
      detectSessionInUrl: false,
    },
  });
  return client;
}

/** Un error de la base de datos con su código (por ejemplo 42501) y el estado HTTP (0 si no hubo conexión). */
function failure(error: { message?: string; code?: string }, status: number): Error {
  return Object.assign(new Error(error.message || `La nube respondió ${status}.`), { code: error.code ?? '', status });
}

function backendFor(db: SupabaseClient, user: string): SyncBackend {
  return {
    async fetchRev() {
      const { data, error, status } = await db.from(TABLE).select('rev').eq('user_id', user).maybeSingle();
      if (error) throw failure(error, status);
      return data ? (data.rev as number) : null;
    },
    async fetch() {
      const { data, error, status } = await db.from(TABLE).select('datos, rev').eq('user_id', user).maybeSingle();
      if (error) throw failure(error, status);
      return data ? { datos: data.datos as unknown, rev: data.rev as number } : null;
    },
    async insert(datos) {
      const { error, status } = await db.from(TABLE).insert({ user_id: user, datos, rev: 1 });
      if (!error) return true;
      if (error.code === '23505') return false; // Otro dispositivo lo creó primero.
      throw failure(error, status);
    },
    async update(datos, rev) {
      const { data, error, status } = await db.from(TABLE).update({ datos, rev: rev + 1 }).eq('user_id', user).eq('rev', rev).select('rev');
      if (error) throw failure(error, status);
      return data.length ? (data[0].rev as number) : null;
    },
  };
}

let meta: SyncMeta | undefined;
let metaLoaded: Promise<void> | null = null;

function loadMeta(): Promise<void> {
  metaLoaded ??= (async () => {
    await progressReady;
    try {
      meta = normalizeMeta(await get(META_KEY));
    } catch {
      meta = undefined;
    }
    setCloudState({ lastSync: meta?.at ?? 0 });
  })();
  return metaLoaded;
}

/** Guarda en el dispositivo, en una sola operación, el progreso de aquí y la versión de la nube de la que sale. */
function saveMeta(m: SyncMeta | undefined): Promise<void> {
  return saveProgressWith([[META_KEY, m]]);
}

/** Olvida la última sincronización: la próxima será como la primera (junta sin perder nada de ningún lado). */
async function forgetMeta(): Promise<void> {
  meta = undefined;
  metaLoaded = Promise.resolve();
  await del(META_KEY).catch(() => undefined);
}

let running: Promise<void> | null = null;
let again = false;
/** Hay cambios aquí que quizás no se han subido. */
let dirty = false;
/** El progreso lo está cambiando la sincronización, no la persona. */
let applying = false;
let lastAttempt = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

function apply(p: Progress) {
  applying = true;
  try {
    replaceProgress(p);
  } finally {
    applying = false;
  }
}

function schedule(ms: number) {
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), ms);
}

/** Sincroniza ahora. Si ya hay una sincronización en curso, hace otra cuando termine. Nunca falla: el error queda en
 * el estado (`error`). */
export function syncNow(): Promise<void> {
  clearTimeout(timer);
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await syncOnce();
      } while (again);
    } finally {
      running = null;
    }
  })();
  return running;
}

/** La cuenta de la sesión. null si la sesión ya no sirve (y entonces se cierra aquí). Falla si no hay conexión. */
async function currentUser(): Promise<string | null> {
  const { data, error } = await supabase().auth.getSession();
  const session = data.session;
  if (session) {
    const email = session.user.email ?? '';
    if (email && email !== getCloudState().email) setCloudState({ email });
    return session.user.id;
  }
  // Sin conexión, la sesión sigue guardada: se intenta otra vez después.
  if (error && (error.name === 'AuthRetryableFetchError' || isOfflineError(error))) throw error;
  await signedOut('Tu sesión se cerró. Vuelve a entrar con tu correo para sincronizar.');
  return null;
}

async function syncOnce(): Promise<void> {
  lastAttempt = Date.now();
  try {
    if (getCloudState().phase !== 'dentro') return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new TypeError('Failed to fetch');
    setCloudState({ syncing: true });
    await loadMeta();
    const user = await currentUser();
    if (!user) return;
    dirty = false;
    const out = await syncProgress({ backend: backendFor(supabase(), user), user, meta, getLocal: getProgress, setLocal: apply, save: saveMeta });
    meta = out.meta;
    await saveMeta(meta);
    setCloudState({ lastSync: meta.at, error: '' });
    if (out.joinedFirstTime) toast('Juntamos el progreso de este dispositivo con el de tu cuenta.', 6000);
  } catch (e) {
    dirty = true;
    setCloudState({ error: syncErrorMessage(e) });
    if (!isOfflineError(e)) console.warn('No se pudo sincronizar', e);
    // Otro dispositivo estaba sincronizando: se vuelve a intentar en un rato.
    if (e instanceof Error && e.name === 'SyncConflictError') schedule(AFTER_CHANGE_MS);
  } finally {
    setCloudState({ syncing: false, ready: true });
  }
}

let stopTriggers: (() => void) | null = null;

function startTriggers() {
  if (stopTriggers) return;
  const offChange = onProgressChange(() => {
    if (applying) return;
    dirty = true;
    schedule(AFTER_CHANGE_MS);
  });
  const onLeave = () => {
    if (dirty) void syncNow();
  };
  const onReturn = () => {
    if (dirty || Date.now() - lastAttempt > MIN_PULL_MS) void syncNow();
  };
  const onVisibility = () => (document.visibilityState === 'hidden' ? onLeave() : onReturn());
  // En la APK, Capacitor avisa con «pause» y «resume», porque visibilitychange puede no llegar.
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('pause', onLeave);
  document.addEventListener('resume', onReturn);
  window.addEventListener('online', onReturn);
  // La sesión se cerró en otra pestaña o la nube ya no la acepta.
  const { data } = supabase().auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT' && getCloudState().phase === 'dentro') void signedOut('Tu sesión se cerró. Vuelve a entrar con tu correo para sincronizar.');
  });
  stopTriggers = () => {
    offChange();
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('pause', onLeave);
    document.removeEventListener('resume', onReturn);
    window.removeEventListener('online', onReturn);
    data.subscription.unsubscribe();
    clearTimeout(timer);
    stopTriggers = null;
  };
}

/** La sesión ya no está en este dispositivo. El progreso se queda aquí. */
async function signedOut(message: string): Promise<void> {
  stopTriggers?.();
  dirty = false;
  // Si se vuelve a entrar, se junta sin base: así no se borra en la cuenta lo que se borró aquí sin sesión.
  await forgetMeta();
  setCloudState({ phase: 'fuera', email: '', codeAt: 0, syncing: false, lastSync: 0, error: message, ready: true });
}

/** Al abrir la app con una sesión guardada: sincroniza y queda atento a los cambios. */
export function startCloud(): void {
  if (getCloudState().phase !== 'dentro') return;
  startTriggers();
  void syncNow();
}

/** Manda el código al correo. Si el correo no tiene cuenta, se crea. Falla con un mensaje para mostrar. */
export async function sendCode(email: string): Promise<void> {
  const { error } = await supabase().auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) throw new Error(authErrorMessage(error));
  const at = Date.now();
  savePendingCode(email, at);
  setCloudState({ phase: 'codigo', email, codeAt: at, error: '' });
}

/** Entra con el código que llegó al correo y hace la primera sincronización. Falla con un mensaje para mostrar. */
export async function verifyCode(code: string): Promise<void> {
  const { email } = getCloudState();
  let failed: unknown;
  try {
    const { data, error } = await supabase().auth.verifyOtp({ email, token: code, type: 'email' });
    if (!error && data.session) {
      clearPendingCode();
      await forgetMeta();
      setCloudState({ phase: 'dentro', email: data.session.user.email ?? email, codeAt: 0, lastSync: 0, error: '', ready: true });
      startTriggers();
      void syncNow();
      return;
    }
    failed = error;
  } catch (e) {
    failed = e;
  }
  throw new Error(authErrorMessage(failed));
}

/** Cierra la sesión en este dispositivo. Antes sube lo que falte. El progreso se queda aquí. */
export async function signOut(): Promise<void> {
  if (dirty) await syncNow();
  await running;
  stopTriggers?.();
  await supabase()
    .auth.signOut({ scope: 'local' })
    .catch(() => undefined);
  // Si no se pudo avisar a la nube (sin conexión), la sesión se borra igual de este dispositivo.
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(SESSION_KEY)) localStorage.removeItem(key);
  } catch {
    // Sin localStorage no hay sesión guardada.
  }
  await signedOut('');
}

/**
 * Se reemplazó el progreso de aquí con la sesión iniciada (se borró o se cargó un archivo): en la próxima
 * sincronización se sube tal cual, sin juntar, para que quede igual en la cuenta y en los otros dispositivos.
 */
export async function markReplaced(): Promise<void> {
  await loadMeta();
  await running;
  const user = storedSession()?.id || meta?.user;
  if (!user) return;
  const last = meta?.user === user ? meta : undefined;
  meta = { user, rev: last?.rev ?? 0, base: last?.base ?? getProgress(), at: last?.at ?? 0, force: true };
  await saveMeta(meta);
  void syncNow();
}
