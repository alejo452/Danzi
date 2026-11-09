// La parte liviana de la sincronización: la configuración, el estado de la cuenta y los textos. No carga Supabase:
// la usan App.tsx y Ajustes, que se cargan siempre. El código que habla con Supabase está en src/lib/cloud.ts y se
// carga aparte, solo cuando hace falta (hay una sesión guardada o la persona pide el código).
import { useSyncExternalStore } from 'react';

/** Proyecto de Supabase (supabase/config.json). */
export const CLOUD = __DANZI_NUBE__;

/** Si la app tiene un proyecto de Supabase configurado. Sin él no se muestra la sincronización. */
export const cloudConfigured = CLOUD.url !== '' && CLOUD.key !== '';

/** Dónde guarda Supabase la sesión en este dispositivo (localStorage). */
export const SESSION_KEY = 'danzi-sesion';

/** El correo al que se mandó el último código, mientras se espera (localStorage). */
const CODE_KEY = 'danzi-codigo';

/** Los códigos de Supabase vencen en una hora. */
export const CODE_VALID_MS = 60 * 60 * 1000;

/** Supabase deja pedir otro código al mismo correo después de 60 segundos. */
export const CODE_RESEND_MS = 60 * 1000;

export type CloudPhase = 'fuera' | 'codigo' | 'dentro';

export type CloudState = {
  /** fuera: sin sesión; codigo: se mandó un código y se espera; dentro: sesión iniciada. */
  phase: CloudPhase;
  /** El correo de la sesión, o al que se mandó el código. */
  email: string;
  /** Cuándo se mandó el último código (ms). */
  codeAt: number;
  /** Hay una sincronización en curso. */
  syncing: boolean;
  /** Cuándo terminó bien la última sincronización (ms), 0 si todavía no hay ninguna. */
  lastSync: number;
  /** Qué pasó en la última sincronización, si falló. Vacío si salió bien. */
  error: string;
  /** El progreso de aquí ya se puede usar sin esperar a la nube: no hay sesión, o ya terminó (bien o mal) la primera
   * sincronización al abrir la app. Los protectores de racha esperan a esto, porque la práctica que falta pudo ser
   * en otro dispositivo. */
  ready: boolean;
};

function storage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/** La sesión guardada en este dispositivo (sin pedir nada a la nube), o null si no hay. */
export function storedSession(): { id: string; email: string } | null {
  try {
    const raw = storage()?.getItem(SESSION_KEY);
    if (!raw) return null;
    const user = (JSON.parse(raw) as { user?: { id?: unknown; email?: unknown } })?.user;
    return { id: typeof user?.id === 'string' ? user.id : '', email: typeof user?.email === 'string' ? user.email : '' };
  } catch {
    return null;
  }
}

/** Si en este dispositivo hay una sesión guardada: solo entonces se carga Supabase al abrir la app. */
export function hasStoredSession(): boolean {
  return storedSession() !== null;
}

/** El código que se está esperando, si se pidió hace menos de una hora. Sobrevive a que Android cierre la app
 * mientras la persona busca el correo. */
export function readPendingCode(now = Date.now()): { email: string; at: number } | null {
  try {
    const raw = storage()?.getItem(CODE_KEY);
    if (!raw) return null;
    const { email, at } = JSON.parse(raw) as { email?: unknown; at?: unknown };
    if (typeof email !== 'string' || typeof at !== 'number' || now - at > CODE_VALID_MS || at > now) return null;
    return { email, at };
  } catch {
    return null;
  }
}

export function savePendingCode(email: string, at: number): void {
  try {
    storage()?.setItem(CODE_KEY, JSON.stringify({ email, at }));
  } catch {
    // Sin localStorage, el código se espera solo mientras la app siga abierta.
  }
}

export function clearPendingCode(): void {
  try {
    storage()?.removeItem(CODE_KEY);
  } catch {
    // Nada que borrar.
  }
}

function initialState(): CloudState {
  const base = { email: '', codeAt: 0, syncing: false, lastSync: 0, error: '', ready: true };
  if (!cloudConfigured) return { ...base, phase: 'fuera' };
  const session = storedSession();
  if (session) return { ...base, phase: 'dentro', email: session.email, ready: false };
  const pending = readPendingCode();
  if (pending) return { ...base, phase: 'codigo', email: pending.email, codeAt: pending.at };
  return { ...base, phase: 'fuera' };
}

let state: CloudState = initialState();
const listeners = new Set<() => void>();

export function getCloudState(): CloudState {
  return state;
}

export function setCloudState(patch: Partial<CloudState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useCloudState(): CloudState {
  return useSyncExternalStore(subscribe, getCloudState);
}

/** Solo `ready`: App.tsx no se vuelve a dibujar con cada cambio de la sincronización. */
export function useCloudReady(): boolean {
  return useSyncExternalStore(subscribe, () => state.ready);
}

/** Vuelve a pedir el correo (por ejemplo, si se escribió mal). */
export function cancelCode(): void {
  clearPendingCode();
  setCloudState({ phase: 'fuera', codeAt: 0, error: '' });
}

/** Correo escrito por la persona, sin espacios y en minúsculas. null si no parece un correo. */
export function cleanEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** Código escrito por la persona: solo los dígitos (Supabase manda de 6 a 10). null si no sirve. */
export function cleanCode(raw: string): string | null {
  const code = raw.replace(/\D/g, '');
  return code.length >= 6 && code.length <= 10 ? code : null;
}

/** «hace un momento», «hace 5 min», «hace 2 h», «ayer» o la fecha. */
export function syncedAgo(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return 'hace un momento';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  if (s < 2 * 86400) return 'ayer';
  return 'el ' + new Date(at).toLocaleDateString('es-CO', { day: 'numeric', month: 'long' });
}

type ErrorLike = { name?: unknown; message?: unknown; status?: unknown; code?: unknown };

function parts(e: unknown) {
  const x = (e && typeof e === 'object' ? e : {}) as ErrorLike;
  return {
    name: typeof x.name === 'string' ? x.name : '',
    message: typeof x.message === 'string' ? x.message : '',
    status: typeof x.status === 'number' ? x.status : undefined,
    code: typeof x.code === 'string' ? x.code : '',
  };
}

/** Si el error es por falta de conexión (y no porque la nube respondió que no). */
export function isOfflineError(e: unknown): boolean {
  const { name, message, status } = parts(e);
  if (status === 0) return true;
  if (name === 'AuthRetryableFetchError' && (status === undefined || status === 0)) return true;
  return name === 'TypeError' && /fetch|network|load failed/i.test(message);
}

const OFFLINE = 'No hay conexión a internet. Revisa tu conexión y vuelve a intentarlo.';
const SETUP = 'Pídele a quien administra Danzi que revise la configuración de la nube (README, «Sincronización»).';

/** Qué decirle a la persona cuando falla pedir o usar el código. */
export function authErrorMessage(e: unknown): string {
  const { message, status, code } = parts(e);
  if (isOfflineError(e)) return OFFLINE;
  const wait = /after (\d+) seconds?/i.exec(message);
  if (wait) return `Espera ${wait[1]} segundos para pedir otro código.`;
  switch (code) {
    case 'otp_expired':
      return 'El código no es correcto o ya venció. Revísalo o pide uno nuevo.';
    case 'over_email_send_rate_limit':
      return 'Ya se mandaron varios códigos. Espera un rato (hasta una hora) antes de pedir otro.';
    case 'over_request_rate_limit':
      return 'Hubo muchos intentos seguidos. Espera unos minutos y vuelve a intentarlo.';
    case 'email_address_invalid':
    case 'validation_failed':
      return 'Ese correo no sirve. Revisa que esté bien escrito.';
    case 'email_address_not_authorized':
      return `Todavía no se pueden mandar códigos a ese correo. ${SETUP}`;
    case 'signup_disabled':
      return `Ese correo no tiene cuenta y no se pueden crear cuentas nuevas. ${SETUP}`;
    case 'email_provider_disabled':
    case 'otp_disabled':
      return `La entrada con código por correo está apagada. ${SETUP}`;
    case 'user_banned':
      return 'Esta cuenta está bloqueada.';
  }
  if (status === 429) return 'Hubo muchos intentos seguidos. Espera unos minutos y vuelve a intentarlo.';
  return 'La nube no respondió. Vuelve a intentarlo en unos minutos.';
}

/** Qué decirle a la persona cuando falla una sincronización. */
export function syncErrorMessage(e: unknown): string {
  const { name, status, code } = parts(e);
  if (name === 'SyncFormatError') return 'Tu cuenta tiene progreso de una versión más nueva de Danzi. Actualiza la app en este dispositivo para sincronizar.';
  if (name === 'SyncConflictError') return 'Otro dispositivo estaba sincronizando al mismo tiempo. Se vuelve a intentar en un momento.';
  if (isOfflineError(e)) return 'Sin conexión. Se sincroniza cuando vuelva el internet.';
  if (code === '42P01' || code === 'PGRST205') return `La nube todavía no tiene dónde guardar el progreso. ${SETUP}`;
  if (code === '42501') return `La nube no dejó guardar el progreso. ${SETUP}`;
  if (code === '23514') return 'Tu progreso es demasiado grande para la nube.';
  if (status === 401 || code === 'PGRST301' || code === 'PGRST303') return 'Tu sesión venció. Cierra sesión y vuelve a entrar.';
  return 'No se pudo sincronizar. Se vuelve a intentar más tarde.';
}
