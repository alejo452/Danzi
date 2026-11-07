// Recordatorio diario en este dispositivo: permiso de notificaciones, suscripción push y el código
// que se pega en GitHub. Se guarda aparte del progreso porque la suscripción es de este dispositivo
// y no debe pasar a otro al descargar y cargar el progreso.
import { del, get, set } from 'idb-keyval';
import { bytesToBase64Url, encodeReminderCode, type ReminderCode } from './reminderCode';

/** Clave en IndexedDB. El service worker la actualiza si el navegador cambia la suscripción. */
export const REMINDER_KEY = 'reminder';

export type ReminderState = {
  code: ReminderCode;
  /** El código listo para copiar. */
  text: string;
  updatedAt: number;
  /** El código cambió y todavía no se ha copiado de nuevo a GitHub. */
  changed?: boolean;
};

export type ReminderSupport = 'ok' | 'ios-install' | 'unsupported' | 'denied';

export function reminderSupport(): ReminderSupport {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const installed = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return ios && !installed ? 'ios-install' : 'unsupported';
  }
  return Notification.permission === 'denied' ? 'denied' : 'ok';
}

export async function loadReminder(): Promise<ReminderState | undefined> {
  try {
    return await get<ReminderState>(REMINDER_KEY);
  } catch {
    return undefined;
  }
}

/** El service worker activo. Si en 10 segundos no está listo (la app aún se instala), falla con 'sw'. */
export async function swReady(): Promise<ServiceWorkerRegistration> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('sw')), 10_000);
  });
  try {
    return await Promise.race([navigator.serviceWorker.ready, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function withCode(code: ReminderCode, changed: boolean): ReminderState {
  return { code, text: encodeReminderCode(code), updatedAt: Date.now(), changed };
}

/** Pide permiso, crea las claves de este dispositivo y se suscribe a las notificaciones push. */
export async function enableReminder(hour: number): Promise<ReminderState> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error(permission === 'denied' ? 'denied' : 'dismissed');
  const reg = await swReady();
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const { d } = await crypto.subtle.exportKey('jwk', pair.privateKey);
  // Una suscripción anterior está atada a otras claves: hay que quitarla antes de crear la nueva.
  await (await reg.pushManager.getSubscription())?.unsubscribe();
  const sub = (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey })).toJSON();
  if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys.auth || !d) throw new Error('subscribe');
  const state = withCode(
    {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      vapid: { publicKey: bytesToBase64Url(publicKey), privateKey: d },
      hour,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      app: new URL(import.meta.env.BASE_URL, location.origin).href,
    },
    false,
  );
  await set(REMINDER_KEY, state);
  return state;
}

/** Cambia la hora. El código cambia, así que hay que pegarlo de nuevo en GitHub. */
export async function changeReminderHour(state: ReminderState, hour: number): Promise<ReminderState> {
  const next = withCode({ ...state.code, hour }, true);
  await set(REMINDER_KEY, next);
  return next;
}

/** Marca el código como copiado a GitHub. */
export async function markReminderCopied(state: ReminderState): Promise<ReminderState> {
  const next = { ...state, changed: false };
  await set(REMINDER_KEY, next);
  return next;
}

export async function disableReminder(): Promise<void> {
  try {
    const reg = await swReady();
    await (await reg.pushManager.getSubscription())?.unsubscribe();
  } finally {
    await del(REMINDER_KEY);
  }
}

/**
 * Revisa que la suscripción guardada siga activa en el navegador.
 * 'missing': el navegador la borró (por ejemplo, porque se quitó el permiso); hay que activar de nuevo.
 */
export async function checkReminder(state: ReminderState): Promise<'ok' | 'missing'> {
  if (Notification.permission !== 'granted') return 'missing';
  const reg = await swReady();
  const sub = await reg.pushManager.getSubscription();
  return sub && sub.endpoint === state.code.endpoint ? 'ok' : 'missing';
}
