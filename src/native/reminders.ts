// Recordatorio diario en la APK: programa los avisos en el celular con @capacitor/local-notifications.
// Solo se carga dentro de la APK (ver src/lib/native.ts). Qué avisos y con qué texto lo decide
// src/lib/localReminders.ts.
import { LocalNotifications } from '@capacitor/local-notifications';
import { del, get, set } from 'idb-keyval';
import {
  LOCAL_REMINDER_KEY,
  TEST_ID,
  normalizeLocalReminder,
  planLocalReminders,
  planSignature,
  plannedIds,
  type LocalReminder,
  type PlannedReminder,
} from '../lib/localReminders';
import { reminderMessage } from '../lib/reminderMessage';
import { getProgress } from '../lib/useProgress';

const CHANNEL = 'recordatorio';
/** La cara de Xi Bao a la derecha del aviso: android/app/src/main/res/drawable-nodpi/xibao_aviso.png. */
const LARGE_ICON = 'xibao_aviso';

export type NotificationPermission = 'granted' | 'denied' | 'prompt';

export async function loadLocalReminder(): Promise<LocalReminder | undefined> {
  try {
    return normalizeLocalReminder(await get<unknown>(LOCAL_REMINDER_KEY));
  } catch {
    return undefined;
  }
}

export async function notificationPermission(): Promise<NotificationPermission> {
  const { display } = await LocalNotifications.checkPermissions();
  return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt';
}

/** Pide el permiso de notificaciones (Android 13 o superior lo pregunta; antes viene concedido). */
async function askPermission(): Promise<boolean> {
  const { display } = await LocalNotifications.requestPermissions();
  return display === 'granted';
}

let channelReady = false;

/** Canal de Android para el recordatorio: con sonido y visible en la pantalla bloqueada. */
async function ensureChannel(): Promise<void> {
  if (channelReady) return;
  await LocalNotifications.createChannel({
    id: CHANNEL,
    name: 'Recordatorio diario',
    description: 'El aviso diario para practicar chino.',
    importance: 4,
    visibility: 1,
    vibration: true,
  });
  channelReady = true;
}

/**
 * Si el celular deja programar alarmas exactas. La app declara USE_EXACT_ALARM, que Android concede
 * al instalarla. Si no lo tiene, el aviso se programa igual, aunque puede llegar unos minutos tarde.
 * Hay que preguntarlo antes: si se pide una alarma exacta sin permiso, el complemento abre la pantalla
 * de «Alarmas y recordatorios» cada vez que se reprograma.
 */
export async function exactAlarms(): Promise<boolean> {
  try {
    return (await LocalNotifications.checkExactNotificationSetting()).exact_alarm === 'granted';
  } catch {
    return false;
  }
}

async function cancelPlanned(): Promise<void> {
  await LocalNotifications.cancel({ notifications: plannedIds().map((id) => ({ id })) });
}

let lastSignature = '';

/**
 * Programa los avisos de los próximos días según el progreso actual. Si el plan no cambió desde la última
 * vez, no hace nada. Devuelve el plan, o null si el recordatorio está apagado o no hay permiso.
 */
export async function syncReminders(): Promise<PlannedReminder[] | null> {
  const settings = await loadLocalReminder();
  if (!settings) {
    if (lastSignature !== 'off') await cancelPlanned();
    lastSignature = 'off';
    return null;
  }
  if ((await notificationPermission()) !== 'granted') return null;
  const plan = planLocalReminders(getProgress(), settings, new Date());
  const signature = planSignature(plan);
  if (signature === lastSignature) return plan;
  await ensureChannel();
  const exact = await exactAlarms();
  await cancelPlanned();
  await LocalNotifications.schedule({
    notifications: plan.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      largeBody: r.body,
      channelId: CHANNEL,
      schedule: { at: r.at, allowWhileIdle: true },
      isExactNotification: exact,
      autoCancel: true,
      largeIcon: LARGE_ICON,
      extra: { view: 'repasar' },
    })),
  });
  lastSignature = signature;
  return plan;
}

let timer: ReturnType<typeof setTimeout> | undefined;

/** Reprograma unos segundos después del último cambio, para no hacerlo con cada tarjeta. */
export function queueSync(delay = 3000): void {
  clearTimeout(timer);
  timer = setTimeout(() => {
    syncReminders().catch((e) => console.error('No se pudo programar el recordatorio', e));
  }, delay);
}

function validTime(hour: number, minute: number): LocalReminder {
  const settings = normalizeLocalReminder({ hour, minute });
  if (!settings) throw new RangeError('La hora del recordatorio no es válida.');
  return settings;
}

export async function enableLocalReminder(hour: number, minute = 0): Promise<'ok' | 'denied'> {
  const settings = validTime(hour, minute);
  if (!(await askPermission())) return 'denied';
  await set(LOCAL_REMINDER_KEY, settings);
  lastSignature = '';
  await syncReminders();
  return 'ok';
}

export async function changeLocalReminderHour(hour: number, minute = 0): Promise<PlannedReminder[] | null> {
  const settings = validTime(hour, minute);
  await set(LOCAL_REMINDER_KEY, settings);
  return syncReminders();
}

export async function disableLocalReminder(): Promise<void> {
  await del(LOCAL_REMINDER_KEY);
  await cancelPlanned();
  lastSignature = 'off';
}

/** Muestra ya un aviso con el texto que tendría ahora. */
export async function testLocalReminder(): Promise<'ok' | 'denied'> {
  if ((await notificationPermission()) !== 'granted' && !(await askPermission())) return 'denied';
  await ensureChannel();
  const m = reminderMessage(getProgress(), new Date());
  await LocalNotifications.schedule({
    notifications: [
      {
        id: TEST_ID,
        title: m.title,
        body: m.body,
        largeBody: m.body,
        channelId: CHANNEL,
        isExactNotification: false,
        autoCancel: true,
        largeIcon: LARGE_ICON,
        extra: { view: 'repasar' },
      },
    ],
  });
  return 'ok';
}

/** Al tocar un aviso, la app se abre en la vista que indica (Repasar). */
export function listenForTaps(open: (view: string) => void): void {
  LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
    const view = (action.notification.extra as { view?: string } | undefined)?.view;
    open(view ?? 'repasar');
  }).catch((e) => console.error('No se pudo escuchar los toques en el aviso', e));
}
