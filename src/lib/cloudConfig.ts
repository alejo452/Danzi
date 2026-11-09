// La parte liviana de la sincronización: la configuración, el estado de la cuenta y los textos. No carga Supabase:
// la usan App.tsx y Ajustes, que se cargan siempre. El código que habla con Supabase está en src/lib/cloud.ts y se
// carga aparte, solo cuando hace falta (hay una sesión guardada o la persona entra o crea su cuenta).
import { useSyncExternalStore } from 'react';

/** Proyecto de Supabase (supabase/config.json). */
export const CLOUD = __DANZI_NUBE__;

/** Si la app tiene un proyecto de Supabase configurado. Sin él no se muestra la sincronización. */
export const cloudConfigured = CLOUD.url !== '' && CLOUD.key !== '';

/** Dónde guarda Supabase la sesión en este dispositivo (localStorage). */
export const SESSION_KEY = 'danzi-sesion';

/** Largo mínimo de la contraseña al crear la cuenta. Supabase pide 6; se piden 8 para que sea más difícil de adivinar. */
export const MIN_PASSWORD = 8;
/** Supabase no acepta contraseñas de más de 72 caracteres. */
export const MAX_PASSWORD = 72;

export type CloudPhase = 'fuera' | 'dentro';

export type CloudState = {
  /** fuera: sin sesión; dentro: sesión iniciada. */
  phase: CloudPhase;
  /** El correo de la sesión. */
  email: string;
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

function initialState(): CloudState {
  const base = { email: '', syncing: false, lastSync: 0, error: '', ready: true };
  const session = cloudConfigured ? storedSession() : null;
  if (session) return { ...base, phase: 'dentro', email: session.email, ready: false };
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

/** Correo escrito por la persona, sin espacios y en minúsculas. null si no parece un correo. */
export function cleanEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** Qué le falta a una contraseña nueva, o vacío si sirve. */
export function newPasswordProblem(password: string): string {
  if (password.length < MIN_PASSWORD) return `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`;
  if (password.length > MAX_PASSWORD) return `La contraseña puede tener máximo ${MAX_PASSWORD} caracteres.`;
  if (password.trim() !== password) return 'La contraseña no puede empezar ni terminar con un espacio.';
  return '';
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
const SETUP = 'Pídele a quien administra Danzi que revise la configuración de la nube (README, «Sincronizar entre dispositivos»).';

/** Qué decirle a la persona cuando falla entrar o crear la cuenta. */
export function authErrorMessage(e: unknown): string {
  const { message, status, code } = parts(e);
  if (isOfflineError(e)) return OFFLINE;
  switch (code) {
    case 'invalid_credentials':
      return 'El correo o la contraseña no coinciden. Revísalos y vuelve a intentarlo.';
    case 'user_already_exists':
    case 'email_exists':
      return 'Ya hay una cuenta con ese correo. Toca «Ya tengo cuenta» y entra con tu contraseña.';
    case 'weak_password':
      return `Esa contraseña es muy fácil de adivinar. Usa al menos ${MIN_PASSWORD} caracteres, con letras y números.`;
    case 'email_address_invalid':
      return 'Ese correo no sirve. Revisa que esté bien escrito.';
    case 'validation_failed':
      return /password/i.test(message) ? newPasswordProblem('') : 'Ese correo no sirve. Revisa que esté bien escrito.';
    // Supabase todavía pide confirmar el correo: hay que apagar «Confirm email».
    case 'email_not_confirmed':
    case 'email_address_not_authorized':
    case 'over_email_send_rate_limit':
      return `Supabase está pidiendo confirmar el correo de la cuenta. ${SETUP}`;
    case 'signup_disabled':
      return 'No se pueden crear cuentas nuevas. Si ya tienes una, toca «Ya tengo cuenta».';
    case 'email_provider_disabled':
      return `La entrada con correo está apagada. ${SETUP}`;
    case 'over_request_rate_limit':
      return 'Hubo muchos intentos seguidos. Espera unos minutos y vuelve a intentarlo.';
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
