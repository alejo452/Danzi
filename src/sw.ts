/// <reference lib="webworker" />
// Service worker de Danzi.
// - Guarda la app y los trazos de todos los caracteres al instalarse, para usarla sin internet.
// - Muestra el recordatorio diario cuando llega la notificación push (la envía
//   .github/workflows/recordatorios.yml). El texto se arma aquí con el progreso guardado.
import { get, set } from 'idb-keyval';
import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { normalizeProgress } from './lib/progress';
import { base64UrlToBytes, encodeReminderCode } from './lib/reminderCode';
import { reminderMessage, reminderNotification, type ReminderMessage } from './lib/reminderMessage';
import { PUSH_LOG_KEY, REMINDER_KEY, type PushLog, type ReminderState } from './lib/reminders';

declare const self: ServiceWorkerGlobalScope;

// Una versión nueva toma el control enseguida (registerType: 'autoUpdate').
self.skipWaiting();
clientsClaim();

// La lista de archivos (app, íconos y strokes/*.json) la inyecta vite-plugin-pwa en el build.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({ cacheName: 'fonts', plugins: [new ExpirationPlugin({ maxEntries: 60 })] }),
);

const TEST_MESSAGE: ReminderMessage = {
  title: 'Así te llega el recordatorio',
  body: 'Los recordatorios de Danzi ya funcionan en este dispositivo.',
  studiedToday: false,
};

/** Si algo falla al leer el progreso, el aviso sale igual con este texto. */
const PLAIN_MESSAGE: ReminderMessage = { title: 'Es hora de practicar chino', body: 'Abre Danzi y repasa un rato.', studiedToday: false };

async function buildMessage(kind: string): Promise<ReminderMessage> {
  if (kind === 'prueba') return TEST_MESSAGE;
  try {
    return reminderMessage(normalizeProgress(await get('progress')), new Date());
  } catch {
    return PLAIN_MESSAGE;
  }
}

async function showReminder(data: PushMessageData | null): Promise<void> {
  let kind = 'diario';
  try {
    kind = (data?.json() as { tipo?: string } | undefined)?.tipo ?? kind;
  } catch {
    // Sin datos o con datos que no son JSON: se muestra el recordatorio normal.
  }
  const message = await buildMessage(kind);
  const { title, options } = reminderNotification(message, self.registration.scope);
  const log: PushLog = { at: Date.now(), kind, shown: true };
  try {
    await self.registration.showNotification(title, options);
  } catch (e) {
    // Segundo intento sin íconos ni opciones, por si alguna no la acepta el celular.
    log.error = String(e);
    try {
      await self.registration.showNotification(title, { body: message.body });
    } catch (e2) {
      log.shown = false;
      log.error += ` / ${String(e2)}`;
    }
  }
  // Ajustes muestra cuándo llegó el último aviso, para saber si el envío llega al celular.
  await set(PUSH_LOG_KEY, log).catch(() => undefined);
}

self.addEventListener('push', (event) => {
  event.waitUntil(showReminder(event.data));
});

// Al tocar la notificación: abre Danzi en Repasar, o la trae al frente si ya estaba abierta.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | null)?.url ?? self.registration.scope;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => w.url.startsWith(self.registration.scope));
      if (open) {
        await open.focus();
        await open.navigate(url).catch(() => undefined);
      } else {
        await self.clients.openWindow(url);
      }
    })(),
  );
});

// Si el navegador renueva la suscripción, se guarda la nueva y Ajustes pide copiar el código otra vez.
type SubscriptionChangeEvent = ExtendableEvent & { newSubscription?: PushSubscription | null };
self.addEventListener('pushsubscriptionchange', (event) => {
  const e = event as SubscriptionChangeEvent;
  e.waitUntil(
    (async () => {
      const state = await get<ReminderState>(REMINDER_KEY);
      if (!state) return;
      const sub =
        e.newSubscription ??
        (await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(state.code.vapid.publicKey) }));
      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return;
      const code = { ...state.code, endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } };
      await set(REMINDER_KEY, { code, text: encodeReminderCode(code), updatedAt: Date.now(), changed: true } satisfies ReminderState);
    })(),
  );
});
