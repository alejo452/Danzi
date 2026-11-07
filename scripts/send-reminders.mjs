// Envía el recordatorio diario de Danzi a cada dispositivo registrado.
//
// Lo ejecuta .github/workflows/recordatorios.yml cada hora. Los dispositivos se registran
// pegando su código (Ajustes › Recordatorio diario) en los secretos DANZI_RECORDATORIO,
// DANZI_RECORDATORIO_2 o DANZI_RECORDATORIO_3, que el workflow pasa como variables de entorno.
// A cada uno le llega el aviso en la hora que eligió, en su zona horaria.
//
//   node scripts/send-reminders.mjs --check   dice si a alguien le toca ahora (escribe due=true|false para GitHub)
//   node scripts/send-reminders.mjs           envía a quienes les toca ahora
//   PROBAR=true node scripts/send-reminders.mjs   envía ya un aviso de prueba a todos
//
// Los códigos son secretos: este script nunca los imprime.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const CODE_PREFIX = 'danzi1.';
const SECRET_PREFIX = 'DANZI_RECORDATORIO';

/** El workflow corre al minuto 7 de cada hora; con esto, una ejecución atrasada sigue contando para su hora. */
export const RUN_MINUTE = 7;

/** Misma lógica que decodeReminderCode en src/lib/reminderCode.ts (las pruebas comprueban que coinciden). */
export function decodeReminderCode(text) {
  const t = text.trim();
  if (!t.startsWith(CODE_PREFIX)) throw new Error('El código no empieza por danzi1.');
  let c;
  try {
    c = JSON.parse(Buffer.from(t.slice(CODE_PREFIX.length), 'base64url').toString('utf8'));
  } catch {
    throw new Error('El código está incompleto o tiene caracteres de más.');
  }
  const ok =
    c &&
    typeof c.endpoint === 'string' &&
    c.endpoint.startsWith('https://') &&
    c.keys?.p256dh &&
    c.keys?.auth &&
    c.vapid?.publicKey &&
    c.vapid?.privateKey &&
    Number.isInteger(c.hour) &&
    c.hour >= 0 &&
    c.hour <= 23 &&
    typeof c.timeZone === 'string' &&
    typeof c.app === 'string';
  if (!ok) throw new Error('Al código le faltan datos.');
  return c;
}

/** Códigos guardados en los secretos. `secrets` va de nombre a valor (las variables DANZI_RECORDATORIO*). */
export function codesFromSecrets(secrets) {
  const out = [];
  for (const [name, value] of Object.entries(secrets ?? {})) {
    if (!name.startsWith(SECRET_PREFIX) || typeof value !== 'string') continue;
    for (const part of value.split(/\s+/)) if (part) out.push({ name, text: part });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Hora local (0–23) a la que corresponde esta ejecución en una zona horaria. */
export function slotHour(now, timeZone) {
  const slot = new Date(now.getTime() - RUN_MINUTE * 60_000);
  const h = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(slot);
  return Number(h) % 24;
}

export function isDue(code, now) {
  try {
    return slotHour(now, code.timeZone) === code.hour;
  } catch {
    return false; // Zona horaria desconocida.
  }
}

/** Contacto para la firma VAPID: la dirección de la app si es https. */
export function vapidSubject(code) {
  return /^https:\/\//.test(code.app) ? code.app : 'https://github.com/';
}

/** Opciones de envío: el aviso vale 3 horas (si el celular está apagado más tiempo, ya no llega tarde). */
export function sendOptions(code) {
  return {
    vapidDetails: { subject: vapidSubject(code), publicKey: code.vapid.publicKey, privateKey: code.vapid.privateKey },
    TTL: 3 * 60 * 60,
    urgency: 'high',
    topic: 'danzi-recordatorio',
  };
}

function hostOf(endpoint) {
  try {
    return new URL(endpoint).host;
  } catch {
    return 'servicio desconocido';
  }
}

/**
 * Explica un error del servicio de avisos (Google, Apple, Mozilla…) sin mostrar datos privados:
 * se quitan la dirección de la suscripción y cualquier texto largo que parezca una clave.
 */
export function describePushError(e, code) {
  const status = e?.statusCode;
  const host = hostOf(code.endpoint);
  const body = (typeof e?.body === 'string' ? e.body : '')
    .split(code.endpoint)
    .join('…')
    .replace(/[A-Za-z0-9_:+/=-]{32,}/g, '…')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  const detail = body ? ` Respuesta: «${body}».` : '';
  if (status === 404 || status === 410) {
    return (
      `${host} respondió ${status}: el celular canceló esta suscripción.${detail} ` +
      'Pasa si se bloquearon las notificaciones de Danzi en el celular, si se activó el recordatorio desde el navegador teniendo la app instalada, ' +
      'o si se desactivó o se volvió a activar en la app. En el celular, abre Danzi › Ajustes › Recordatorio diario, toca «Activar de nuevo» ' +
      'y reemplaza el secreto con el código nuevo.'
    );
  }
  if (status === 401 || status === 403) {
    return `${host} rechazó la firma del aviso (${status}).${detail} Copia otra vez el código desde Ajustes › Recordatorio diario y reemplaza el secreto.`;
  }
  return `no se pudo enviar el aviso (${status ?? e?.message ?? 'error desconocido'}).${detail} Se intenta otra vez en el próximo envío.`;
}

function annotate(level, text) {
  console.log(process.env.GITHUB_ACTIONS ? `::${level}::${text}` : `${level}: ${text}`);
}

/** Los códigos llegan como variables de entorno: DANZI_RECORDATORIO=danzi1.… node scripts/send-reminders.mjs */
function readSecrets() {
  return Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith(SECRET_PREFIX)));
}

async function main() {
  const check = process.argv.includes('--check');
  const test = process.env.PROBAR === 'true';
  const now = new Date();

  const devices = [];
  for (const [i, { name, text }] of codesFromSecrets(readSecrets()).entries()) {
    try {
      devices.push({ label: `${name} (dispositivo ${i + 1})`, code: decodeReminderCode(text) });
    } catch (e) {
      annotate('warning', `El secreto ${name} no tiene un código válido: ${e.message} Cópialo otra vez desde Ajustes › Recordatorio diario.`);
    }
  }
  const due = devices.filter((d) => test || isDue(d.code, now));
  console.log(`${devices.length} dispositivo(s) registrado(s); ${due.length} para avisar ahora${test ? ' (prueba)' : ''}.`);

  if (check) {
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `due=${due.length > 0}\n`);
    return;
  }
  if (!due.length) return;

  const { default: webpush } = await import('web-push');
  const payload = JSON.stringify({ tipo: test ? 'prueba' : 'diario' });
  let failed = 0;
  for (const d of due) {
    const sub = { endpoint: d.code.endpoint, keys: d.code.keys };
    try {
      const res = await webpush.sendNotification(sub, payload, sendOptions(d.code));
      console.log(
        `${d.label}: ${hostOf(d.code.endpoint)} recibió el aviso (${res?.statusCode ?? 'ok'}). ` +
          'Debe aparecer en el celular en menos de un minuto. Si no aparece, abre Danzi › Ajustes › Recordatorio diario: ahí dice si el aviso llegó.',
      );
    } catch (e) {
      failed++;
      annotate('error', `${d.label}: ${describePushError(e, d.code)}`);
    }
  }
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
