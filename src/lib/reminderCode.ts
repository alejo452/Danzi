// Código del recordatorio diario: todo lo que el envío programado (GitHub Actions) necesita para
// mandarle la notificación a un dispositivo. Se pega como secreto del repositorio en GitHub.
// scripts/send-reminders.mjs lo lee con su propia copia de decodeReminderCode (tests/reminders.test.ts
// comprueba que las dos coinciden).

export const CODE_PREFIX = 'danzi1.';

/** Los secretos de GitHub cuyo nombre empieza así se leen como códigos de recordatorio. */
export const SECRET_PREFIX = 'DANZI_RECORDATORIO';

export type ReminderCode = {
  /** Suscripción push del dispositivo. */
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /** Claves VAPID creadas en el dispositivo. La privada firma los envíos a esta suscripción. */
  vapid: { publicKey: string; privateKey: string };
  /** Hora local del recordatorio (0–23) y zona horaria del dispositivo. */
  hour: number;
  timeZone: string;
  /** Dirección de la app. Va como contacto en la firma VAPID. */
  app: string;
};

export function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function isText(x: unknown): x is string {
  return typeof x === 'string' && x.length > 0;
}

export function isReminderCode(x: unknown): x is ReminderCode {
  if (!x || typeof x !== 'object') return false;
  const c = x as Record<string, unknown>;
  const keys = c.keys as Record<string, unknown> | undefined;
  const vapid = c.vapid as Record<string, unknown> | undefined;
  return (
    isText(c.endpoint) &&
    c.endpoint.startsWith('https://') &&
    isText(keys?.p256dh) &&
    isText(keys?.auth) &&
    isText(vapid?.publicKey) &&
    isText(vapid?.privateKey) &&
    Number.isInteger(c.hour) &&
    (c.hour as number) >= 0 &&
    (c.hour as number) <= 23 &&
    isText(c.timeZone) &&
    isText(c.app)
  );
}

export function encodeReminderCode(c: ReminderCode): string {
  return CODE_PREFIX + bytesToBase64Url(new TextEncoder().encode(JSON.stringify(c)));
}

export function decodeReminderCode(text: string): ReminderCode {
  const t = text.trim();
  if (!t.startsWith(CODE_PREFIX)) throw new Error('El código no empieza por danzi1.');
  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder().decode(base64UrlToBytes(t.slice(CODE_PREFIX.length))));
  } catch {
    throw new Error('El código está incompleto o tiene caracteres de más.');
  }
  if (!isReminderCode(data)) throw new Error('Al código le faltan datos.');
  return data;
}

/** "7:43 a. m." para una hora del día (0–23) y sus minutos (0–59). */
export function hourLabel(hour: number, minute = 0): string {
  return new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' }).format(new Date(2026, 0, 1, hour, minute));
}
