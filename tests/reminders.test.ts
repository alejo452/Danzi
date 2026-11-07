// Recordatorio diario: texto del aviso, código para GitHub y envío push.
import crypto from 'node:crypto';
import fs from 'node:fs';
import ece from 'http_ece';
import webpush from 'web-push';
import { describe, expect, it } from 'vitest';
import * as script from '../scripts/send-reminders.mjs';
import { levelOfId } from '../src/data/levelList';
import { addDays } from '../src/lib/dates';
import { freshProgress, type Progress } from '../src/lib/progress';
import { bytesToBase64Url, decodeReminderCode, encodeReminderCode, type ReminderCode } from '../src/lib/reminderCode';
import { reminderMessage } from '../src/lib/reminderMessage';
import type { StoredCard } from '../src/lib/srs';

describe('niveles por id', () => {
  it('ubica cada palabra del temario en su nivel', () => {
    const syllabus: [number, string][] = JSON.parse(fs.readFileSync('data-source/hsk-2025-syllabus.json', 'utf8'));
    for (const [id, level] of syllabus) expect(levelOfId(id), `id ${id}`).toBe(level);
    expect(levelOfId(0)).toBeUndefined();
    expect(levelOfId(11001)).toBeUndefined();
  });
});

const NOW = new Date(2026, 10, 7, 19, 0); // 7 de noviembre de 2026, 7:00 p. m. (hora local)

function card(due: Date): StoredCard {
  return { due: due.toISOString(), stability: 3, difficulty: 5, elapsed_days: 1, scheduled_days: 1, learning_steps: 0, reps: 2, lapses: 0, state: 2 };
}

function progressWith(change: (p: Progress) => void): Progress {
  const p = freshProgress();
  change(p);
  return p;
}

const day = (offset: number) => {
  const d = addDays(NOW, offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

describe('texto del recordatorio', () => {
  it('invita a empezar si no hay racha', () => {
    const m = reminderMessage(freshProgress(), NOW);
    expect(m).toEqual({ title: 'Es hora de practicar chino', body: 'Te esperan 10 palabras nuevas.', studiedToday: false });
  });

  it('avisa que la racha está en juego y cuenta las tarjetas de hoy', () => {
    const p = progressWith((p) => {
      p.log[day(-1)] = { r: 20 };
      p.log[day(-2)] = { r: 5 };
      p.decks.read['1'] = card(new Date(NOW.getTime() - 3_600_000)); // atrasada
      p.decks.read['2'] = card(new Date(NOW.getTime() + 3_600_000)); // vence hoy más tarde
      p.decks.write['1'] = card(addDays(NOW, 3)); // no toca hoy
    });
    expect(reminderMessage(p, NOW)).toEqual({
      title: 'No pierdas tu racha de 2 días',
      body: 'Tienes 2 tarjetas para repasar y 10 palabras nuevas. Con unos minutos la mantienes.',
      studiedToday: false,
    });
  });

  it('no cuenta tarjetas de niveles que no estás estudiando', () => {
    const p = progressWith((p) => {
      p.decks.read['301'] = card(NOW); // HSK 2, no activo
      p.settings.newPerDay = 0;
    });
    expect(reminderMessage(p, NOW).body).toBe('Practica un rato en Escribir o Hablar.');
  });

  it('concuerda en singular', () => {
    const one = progressWith((p) => {
      p.settings.newPerDay = 1;
    });
    expect(reminderMessage(one, NOW).body).toBe('Te espera 1 palabra nueva.');
    const studied = progressWith((p) => {
      p.log[day(0)] = { r: 1 };
      p.decks.read['1'] = card(new Date(NOW.getTime() + 600_000));
    });
    expect(reminderMessage(studied, NOW)).toEqual({ title: '¡Bien hecho hoy!', body: 'Ya practicaste hoy. Si quieres, te queda 1 tarjeta para repasar.', studiedToday: true });
  });

  it('felicita en silencio si ya practicaste hoy', () => {
    const p = progressWith((p) => {
      p.log[day(0)] = { r: 3 };
      p.log[day(-1)] = { r: 3 };
      p.log[day(-2)] = { w: 1 };
    });
    expect(reminderMessage(p, NOW)).toEqual({ title: '¡Llevas 3 días seguidos!', body: 'Ya practicaste hoy. Nos vemos mañana.', studiedToday: true });
  });
});

const SAMPLE: ReminderCode = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc:123',
  keys: { p256dh: 'BPp256dh', auth: 'auth' },
  vapid: { publicKey: 'BPublic', privateKey: 'private' },
  hour: 19,
  timeZone: 'America/Bogota',
  app: 'https://alejo452.github.io/Danzi/',
};

describe('código para GitHub', () => {
  it('se lee igual en la app y en el script de envío', () => {
    const text = encodeReminderCode(SAMPLE);
    expect(text.startsWith('danzi1.')).toBe(true);
    expect(text).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(decodeReminderCode(text)).toEqual(SAMPLE);
    expect(script.decodeReminderCode(`\n  ${text}  \n`)).toEqual(SAMPLE);
  });

  it('rechaza códigos incompletos o ajenos', () => {
    const text = encodeReminderCode(SAMPLE);
    for (const bad of ['hola', text.slice(0, 40), encodeReminderCode({ ...SAMPLE, hour: 24 }), encodeReminderCode({ ...SAMPLE, endpoint: 'http://x' })]) {
      expect(() => decodeReminderCode(bad)).toThrow();
      expect(() => script.decodeReminderCode(bad)).toThrow();
    }
  });

  it('toma los códigos de los secretos DANZI_RECORDATORIO*, aunque haya varios en uno', () => {
    const codes = script.codesFromSecrets({
      GITHUB_TOKEN: 'ghs_x',
      DANZI_RECORDATORIO_2: 'danzi1.b',
      DANZI_RECORDATORIO: ' danzi1.a\ndanzi1.c ',
      OTRO: 'danzi1.z',
    });
    expect(codes.map((c) => c.text)).toEqual(['danzi1.a', 'danzi1.c', 'danzi1.b']);
  });
});

describe('hora del envío', () => {
  const code = { ...SAMPLE, hour: 19, timeZone: 'America/Bogota' }; // Bogotá: UTC−5, sin horario de verano
  it('avisa en la hora elegida, aunque GitHub ejecute el workflow con retraso', () => {
    expect(script.isDue(code, new Date('2026-11-08T00:07:00Z'))).toBe(true); // 7:07 p. m.
    expect(script.isDue(code, new Date('2026-11-08T00:55:00Z'))).toBe(true); // 7:55 p. m.
    expect(script.isDue(code, new Date('2026-11-08T01:05:00Z'))).toBe(true); // 8:05 p. m., la ejecución de las 7 atrasada
  });

  it('no avisa en otras horas', () => {
    expect(script.isDue(code, new Date('2026-11-08T01:07:00Z'))).toBe(false); // 8:07 p. m.
    expect(script.isDue(code, new Date('2026-11-07T23:07:00Z'))).toBe(false); // 6:07 p. m.
    expect(script.isDue({ ...code, timeZone: 'Zona/Inventada' }, new Date('2026-11-08T00:07:00Z'))).toBe(false);
  });

  it('respeta el horario de verano de otras zonas', () => {
    const madrid = { ...SAMPLE, hour: 9, timeZone: 'Europe/Madrid' };
    expect(script.isDue(madrid, new Date('2026-07-01T07:07:00Z'))).toBe(true); // verano: UTC+2
    expect(script.isDue(madrid, new Date('2026-12-01T08:07:00Z'))).toBe(true); // invierno: UTC+1
  });
});

describe('errores del envío', () => {
  const code = { ...SAMPLE, endpoint: 'https://fcm.googleapis.com/fcm/send/cX9_token-privado:APA91bHabcdefghijklmnopqrstuvwxyz0123456789' };

  it('explica que el celular canceló la suscripción, sin mostrar datos privados', () => {
    const text = script.describePushError(
      { statusCode: 410, body: `push subscription has unsubscribed or expired. ${code.endpoint} token=APA91bHabcdefghijklmnopqrstuvwxyz0123456789XYZ\n` },
      code,
    );
    expect(text).toContain('fcm.googleapis.com respondió 410: el celular canceló esta suscripción.');
    expect(text).toContain('«push subscription has unsubscribed or expired. … …»');
    expect(text).toContain('Activar de nuevo');
    expect(text).not.toContain('APA91b');
    expect(text).not.toContain('token-privado');
  });

  it('distingue una firma rechazada y un fallo de red', () => {
    expect(script.describePushError({ statusCode: 403, body: 'invalid JWT' }, code)).toContain('rechazó la firma del aviso (403). Respuesta: «invalid JWT».');
    expect(script.describePushError(new Error('connect ECONNREFUSED'), code)).toBe('no se pudo enviar el aviso (connect ECONNREFUSED). Se intenta otra vez en el próximo envío.');
  });
});

describe('envío push', () => {
  it('firma y cifra el aviso para que solo lo lea el dispositivo', async () => {
    // Claves VAPID creadas como en el navegador (src/lib/reminders.ts).
    const pair = await crypto.webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const vapidPublic = bytesToBase64Url(new Uint8Array(await crypto.webcrypto.subtle.exportKey('raw', pair.publicKey)));
    const { d } = await crypto.webcrypto.subtle.exportKey('jwk', pair.privateKey);
    // Claves de la suscripción, como las crea el navegador del celular.
    const device = crypto.createECDH('prime256v1');
    device.generateKeys();
    const auth = bytesToBase64Url(crypto.randomBytes(16));
    const code: ReminderCode = {
      ...SAMPLE,
      endpoint: 'https://fcm.googleapis.com/fcm/send/dispositivo-de-prueba',
      keys: { p256dh: bytesToBase64Url(device.getPublicKey()), auth },
      vapid: { publicKey: vapidPublic, privateKey: d! },
    };

    const decoded = script.decodeReminderCode(encodeReminderCode(code));
    const payload = JSON.stringify({ tipo: 'diario' });
    const req = webpush.generateRequestDetails({ endpoint: decoded.endpoint, keys: decoded.keys }, payload, script.sendOptions(decoded));

    expect(req.method).toBe('POST');
    expect(req.endpoint).toBe(code.endpoint);
    expect(req.headers.TTL).toBe(10800);
    expect(req.headers.Urgency).toBe('high');
    expect(req.headers.Topic).toBe('danzi-recordatorio');
    expect(req.headers['Content-Encoding']).toBe('aes128gcm');

    // El dispositivo puede descifrar el aviso con su clave privada.
    const plain = ece.decrypt(req.body, { version: 'aes128gcm', privateKey: device, authSecret: auth });
    expect(plain.toString('utf8')).toBe(payload);

    // La firma VAPID es válida para la clave pública del código.
    const m = /^vapid t=([^,]+), k=(.+)$/.exec(String(req.headers.Authorization));
    expect(m?.[2]).toBe(vapidPublic);
    const [h, b, s] = m![1].split('.');
    const claims = JSON.parse(Buffer.from(b, 'base64url').toString());
    expect(claims.aud).toBe('https://fcm.googleapis.com');
    expect(claims.sub).toBe(SAMPLE.app);
    const raw = Buffer.from(vapidPublic, 'base64url');
    const key = crypto.createPublicKey({
      key: { kty: 'EC', crv: 'P-256', x: raw.subarray(1, 33).toString('base64url'), y: raw.subarray(33).toString('base64url') },
      format: 'jwk',
    });
    const ok = crypto.verify('sha256', Buffer.from(`${h}.${b}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'));
    expect(ok).toBe(true);
  });
});
