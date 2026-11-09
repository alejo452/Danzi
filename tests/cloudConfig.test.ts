import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  authErrorMessage,
  cleanEmail,
  isOfflineError,
  MAX_PASSWORD,
  MIN_PASSWORD,
  newPasswordProblem,
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

  it('pide una contraseña nueva de al menos 8 caracteres', () => {
    expect(MIN_PASSWORD).toBe(8);
    expect(newPasswordProblem('mandarín8')).toBe('');
    expect(newPasswordProblem('corta1')).toMatch(/al menos 8/);
    expect(newPasswordProblem('x'.repeat(MAX_PASSWORD + 1))).toMatch(/máximo 72/);
    expect(newPasswordProblem(' conespacio ')).toMatch(/espacio/);
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

describe('sesión guardada en el dispositivo', () => {
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

  it('sin localStorage no falla', () => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    expect(storedSession()).toBeNull();
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

  it('explica qué pasó al entrar o crear la cuenta, y qué hacer', () => {
    expect(authErrorMessage({ name: 'AuthApiError', status: 400, code: 'invalid_credentials', message: 'Invalid login credentials' })).toMatch(/no coinciden/);
    expect(authErrorMessage({ status: 422, code: 'user_already_exists', message: 'User already registered' })).toMatch(/Ya tengo cuenta/);
    expect(authErrorMessage({ name: 'AuthWeakPasswordError', status: 422, code: 'weak_password' })).toMatch(/fácil de adivinar/);
    expect(authErrorMessage({ status: 400, code: 'email_address_invalid' })).toMatch(/bien escrito/);
    expect(authErrorMessage({ status: 422, code: 'validation_failed', message: 'Unable to validate email address: invalid format' })).toMatch(/bien escrito/);
    expect(authErrorMessage({ status: 422, code: 'validation_failed', message: 'Password should be at least 6 characters.' })).toMatch(/al menos 8/);
    // Si el proyecto todavía pide confirmar el correo, remite al README (hay que apagar «Confirm email»).
    expect(authErrorMessage({ status: 400, code: 'email_not_confirmed' })).toMatch(/README/);
    expect(authErrorMessage({ status: 400, code: 'email_address_not_authorized' })).toMatch(/README/);
    expect(authErrorMessage({ status: 403, code: 'signup_disabled' })).toMatch(/Ya tengo cuenta/);
    expect(authErrorMessage({ status: 429, code: 'over_request_rate_limit' })).toMatch(/muchos intentos/);
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
