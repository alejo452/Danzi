import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  authErrorMessage,
  CODE_VALID_MS,
  cleanCode,
  cleanEmail,
  clearPendingCode,
  isOfflineError,
  readPendingCode,
  savePendingCode,
  SESSION_KEY,
  storedSession,
  syncedAgo,
  syncErrorMessage,
} from '../src/lib/cloudConfig';
import { SyncConflictError, SyncFormatError } from '../src/lib/cloudSync';

describe('lo que escribe la persona', () => {
  it('limpia el correo y rechaza lo que no lo es', () => {
    expect(cleanEmail('  Diego.Perez@Gmail.com ')).toBe('diego.perez@gmail.com');
    expect(cleanEmail('diego@gmail')).toBeNull();
    expect(cleanEmail('diego gmail.com')).toBeNull();
    expect(cleanEmail('')).toBeNull();
  });

  it('acepta códigos de 6 a 10 dígitos, con espacios o guiones', () => {
    expect(cleanCode('123456')).toBe('123456');
    expect(cleanCode(' 123 456 ')).toBe('123456');
    expect(cleanCode('1234-5678')).toBe('12345678');
    expect(cleanCode('12345')).toBeNull();
    expect(cleanCode('12345678901')).toBeNull();
  });
});

describe('cuándo fue la última sincronización', () => {
  const now = new Date('2026-11-09T15:00:00-05:00').getTime();
  it('dice el tiempo de forma corta', () => {
    expect(syncedAgo(now - 20_000, now)).toBe('hace un momento');
    expect(syncedAgo(now - 5 * 60_000, now)).toBe('hace 5 min');
    expect(syncedAgo(now - 3 * 3600_000, now)).toBe('hace 3 h');
    expect(syncedAgo(now - 30 * 3600_000, now)).toBe('ayer');
    expect(syncedAgo(new Date('2026-11-02T10:00:00-05:00').getTime(), now)).toMatch(/^el 2 de noviembre$/);
    // Con el reloj atrasado, no dice «hace -1 min».
    expect(syncedAgo(now + 60_000, now)).toBe('hace un momento');
  });
});

describe('sesión y código guardados en el dispositivo', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
    };
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('lee el correo y la cuenta de la sesión sin pedir nada a la nube', () => {
    expect(storedSession()).toBeNull();
    store.set(SESSION_KEY, JSON.stringify({ access_token: 'x', user: { id: 'u1', email: 'diego@gmail.com' } }));
    expect(storedSession()).toEqual({ id: 'u1', email: 'diego@gmail.com' });
    store.set(SESSION_KEY, '{roto');
    expect(storedSession()).toBeNull();
  });

  it('recuerda el código pedido durante una hora', () => {
    const at = 1_000_000;
    savePendingCode('diego@gmail.com', at);
    expect(readPendingCode(at + 1000)).toEqual({ email: 'diego@gmail.com', at });
    expect(readPendingCode(at + CODE_VALID_MS + 1)).toBeNull();
    clearPendingCode();
    expect(readPendingCode(at + 1000)).toBeNull();
  });

  it('sin localStorage no falla', () => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    expect(storedSession()).toBeNull();
    expect(readPendingCode()).toBeNull();
    expect(() => savePendingCode('a@b.co', 1)).not.toThrow();
  });
});

describe('mensajes de error', () => {
  it('distingue la falta de conexión de una respuesta de la nube', () => {
    expect(isOfflineError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isOfflineError({ name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' })).toBe(true);
    expect(isOfflineError(Object.assign(new Error('TypeError: Failed to fetch'), { code: '', status: 0 }))).toBe(true);
    expect(isOfflineError({ name: 'AuthRetryableFetchError', status: 503 })).toBe(false);
    expect(isOfflineError(Object.assign(new Error('x'), { code: '42501', status: 403 }))).toBe(false);
  });

  it('explica qué pasó con el código y qué hacer', () => {
    expect(authErrorMessage({ name: 'AuthApiError', status: 403, code: 'otp_expired', message: 'Token has expired or is invalid' })).toMatch(/no es correcto o ya venció/);
    expect(authErrorMessage({ status: 429, code: 'over_email_send_rate_limit', message: 'For security purposes, you can only request this after 42 seconds.' })).toBe(
      'Espera 42 segundos para pedir otro código.',
    );
    expect(authErrorMessage({ status: 429, code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' })).toMatch(/hasta una hora/);
    expect(authErrorMessage({ status: 400, code: 'email_address_not_authorized' })).toMatch(/README/);
    expect(authErrorMessage({ status: 400, code: 'email_address_invalid' })).toMatch(/bien escrito/);
    expect(authErrorMessage(new TypeError('Failed to fetch'))).toMatch(/conexión/);
    expect(authErrorMessage({ status: 500, code: 'unexpected_failure' })).toMatch(/no respondió/);
  });

  it('explica qué pasó con la sincronización', () => {
    expect(syncErrorMessage(new SyncFormatError())).toMatch(/Actualiza la app/);
    expect(syncErrorMessage(new SyncConflictError())).toMatch(/Se vuelve a intentar/);
    expect(syncErrorMessage(new TypeError('Failed to fetch'))).toMatch(/Sin conexión/);
    expect(syncErrorMessage(Object.assign(new Error('no existe'), { code: 'PGRST205', status: 404 }))).toMatch(/README/);
    expect(syncErrorMessage(Object.assign(new Error('rls'), { code: '42501', status: 403 }))).toMatch(/README/);
    expect(syncErrorMessage(Object.assign(new Error('jwt'), { code: 'PGRST301', status: 401 }))).toMatch(/sesión venció/);
    expect(syncErrorMessage(Object.assign(new Error('x'), { code: 'XX000', status: 500 }))).toMatch(/más tarde/);
  });
});
