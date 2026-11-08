// Recordatorio diario de la APK de Android: el propio celular programa los avisos de los próximos
// días, como una alarma. No necesita GitHub, ni internet, ni pegar ningún código.
// Aquí solo se decide cuándo avisar y qué decir (funciones puras, con pruebas en
// tests/localReminders.test.ts). src/native/reminders.ts los programa en Android.
import { addDays, dayKey } from './dates';
import { practiced, type Progress } from './progress';
import { reminderMessage } from './reminderMessage';

/**
 * Clave en IndexedDB con la hora elegida. Es de este dispositivo, como el recordatorio de la web:
 * no va dentro del progreso, así que no pasa a otro dispositivo al descargar y cargar el progreso.
 */
export const LOCAL_REMINDER_KEY = 'reminder-local';

export type LocalReminder = { hour: number };

/** Días que se programan por adelantado. Si no abres la app en dos semanas, los avisos se acaban. */
export const DAYS_AHEAD = 14;

/** Ids de las notificaciones: un id por día (FIRST_ID en adelante) y otro para la prueba. */
export const FIRST_ID = 7700;
export const TEST_ID = 7799;

export type PlannedReminder = { id: number; at: Date; title: string; body: string };

/**
 * Los avisos de los próximos días, a la hora elegida (en punto). Si hoy ya practicaste o la hora ya pasó,
 * empiezan mañana. Cada texto es el que corresponde a ese día si no vuelves a practicar antes:
 * con la racha en riesgo y las tarjetas que se van acumulando.
 */
export function planLocalReminders(p: Progress, hour: number, now: Date, days = DAYS_AHEAD): PlannedReminder[] {
  const studiedToday = practiced(p.log[dayKey(now)]);
  const plan: PlannedReminder[] = [];
  for (let i = 0; plan.length < days; i++) {
    const at = addDays(now, i);
    at.setHours(hour, 0, 0, 0);
    if (i === 0 && (studiedToday || at.getTime() <= now.getTime())) continue;
    const m = reminderMessage(p, at);
    plan.push({ id: FIRST_ID + plan.length, at, title: m.title, body: m.body });
  }
  return plan;
}

/** Ids de todos los avisos diarios que pudo haber programado la app (para cancelarlos). */
export function plannedIds(): number[] {
  return Array.from({ length: DAYS_AHEAD }, (_, i) => FIRST_ID + i);
}

/** Resumen de un plan: si no cambió, no hace falta volver a programar los avisos. */
export function planSignature(plan: PlannedReminder[]): string {
  return JSON.stringify(plan.map((r) => [r.id, r.at.getTime(), r.title, r.body]));
}
