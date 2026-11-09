// El puente se simula: estas pruebas no envían notificaciones ni piden permisos reales.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { freshProgress } from '../src/lib/progress';
import { LOCAL_REMINDER_KEY } from '../src/lib/localReminders';

const mocks = vi.hoisted(() => ({
  storage: new Map<string, unknown>(),
  get: vi.fn(), set: vi.fn(), del: vi.fn(),
  notifications: {
    checkPermissions: vi.fn(), requestPermissions: vi.fn(), createChannel: vi.fn(),
    checkExactNotificationSetting: vi.fn(), cancel: vi.fn(), schedule: vi.fn(), addListener: vi.fn(),
  },
}));

vi.mock('idb-keyval', () => ({ get: mocks.get, set: mocks.set, del: mocks.del }));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: mocks.notifications }));
vi.mock('../src/lib/useProgress', () => ({ getProgress: () => freshProgress() }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 7, 7, 40));
  mocks.storage.clear();
  mocks.get.mockImplementation(async (key: string) => mocks.storage.get(key));
  mocks.set.mockImplementation(async (key: string, value: unknown) => { mocks.storage.set(key, value); });
  mocks.del.mockImplementation(async (key: string) => { mocks.storage.delete(key); });
  mocks.notifications.checkPermissions.mockResolvedValue({ display: 'granted' });
  mocks.notifications.requestPermissions.mockResolvedValue({ display: 'granted' });
  mocks.notifications.checkExactNotificationSetting.mockResolvedValue({ exact_alarm: 'granted' });
  mocks.notifications.createChannel.mockResolvedValue(undefined);
  mocks.notifications.cancel.mockResolvedValue(undefined);
  mocks.notifications.schedule.mockResolvedValue(undefined);
});

afterEach(() => vi.useRealTimers());

describe('recordatorios con minutos en Android', () => {
  it('lee configuraciones antiguas y programa sus avisos en punto', async () => {
    mocks.storage.set(LOCAL_REMINDER_KEY, { hour: 19 });
    const native = await import('../src/native/reminders');
    expect(await native.loadLocalReminder()).toEqual({ hour: 19, minute: 0 });
    await native.syncReminders();
    const { notifications } = mocks.notifications.schedule.mock.calls[0][0];
    expect(notifications[0].schedule.at).toEqual(new Date(2026, 10, 7, 19));
  });

  it('guarda las 7:43 y las entrega al planificador de Android', async () => {
    const native = await import('../src/native/reminders');
    expect(await native.enableLocalReminder(7, 43)).toBe('ok');
    expect(mocks.storage.get(LOCAL_REMINDER_KEY)).toEqual({ hour: 7, minute: 43 });
    const { notifications } = mocks.notifications.schedule.mock.calls[0][0];
    expect(notifications).toHaveLength(14);
    expect(notifications[0].schedule).toEqual({ at: new Date(2026, 10, 7, 7, 43), allowWhileIdle: true });
    expect(notifications.every((n: { isExactNotification: boolean }) => n.isExactNotification)).toBe(true);
    vi.resetModules();
    const reloaded = await import('../src/native/reminders');
    expect(await reloaded.loadLocalReminder()).toEqual({ hour: 7, minute: 43 });
  });

  it('cancela el plan anterior y reprograma si solo cambian los minutos', async () => {
    const native = await import('../src/native/reminders');
    await native.enableLocalReminder(7, 43);
    await native.changeLocalReminderHour(7, 44);
    expect(mocks.storage.get(LOCAL_REMINDER_KEY)).toEqual({ hour: 7, minute: 44 });
    expect(mocks.notifications.cancel).toHaveBeenCalledTimes(2);
    expect(mocks.notifications.schedule).toHaveBeenCalledTimes(2);
    const { notifications } = mocks.notifications.schedule.mock.calls[1][0];
    expect(notifications[0].schedule.at).toEqual(new Date(2026, 10, 7, 7, 44));
    await native.syncReminders();
    expect(mocks.notifications.schedule).toHaveBeenCalledTimes(2);
  });

  it('no guarda ni programa entradas inválidas', async () => {
    const native = await import('../src/native/reminders');
    for (const [hour, minute] of [[24, 0], [7, 60], [7, -1], [7, NaN]]) {
      await expect(native.enableLocalReminder(hour, minute)).rejects.toThrow(RangeError);
      await expect(native.changeLocalReminderHour(hour, minute)).rejects.toThrow(RangeError);
    }
    expect(mocks.notifications.requestPermissions).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.notifications.schedule).not.toHaveBeenCalled();
  });

  it('conserva el recordatorio anterior si se niega el permiso', async () => {
    mocks.storage.set(LOCAL_REMINDER_KEY, { hour: 19 });
    mocks.notifications.requestPermissions.mockResolvedValue({ display: 'denied' });
    const native = await import('../src/native/reminders');
    expect(await native.enableLocalReminder(7, 43)).toBe('denied');
    expect(mocks.storage.get(LOCAL_REMINDER_KEY)).toEqual({ hour: 19 });
    expect(mocks.notifications.schedule).not.toHaveBeenCalled();
  });

  it('mantiene la hora elegida aunque Android no permita alarmas exactas', async () => {
    mocks.notifications.checkExactNotificationSetting.mockResolvedValue({ exact_alarm: 'denied' });
    const native = await import('../src/native/reminders');
    await native.enableLocalReminder(7, 43);
    const { notifications } = mocks.notifications.schedule.mock.calls[0][0];
    expect(notifications[0].schedule.at).toEqual(new Date(2026, 10, 7, 7, 43));
    expect(notifications[0].isExactNotification).toBe(false);
  });
});
