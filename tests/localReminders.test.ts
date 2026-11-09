// Recordatorio de la APK de Android: qué avisos programa el celular y con qué texto.
import { describe, expect, it } from 'vitest';
import { addDays, dayKey } from '../src/lib/dates';
import { DAYS_AHEAD, FIRST_ID, TEST_ID, planLocalReminders, planSignature, plannedIds, normalizeLocalReminder } from '../src/lib/localReminders';
import { freshProgress, type Progress } from '../src/lib/progress';
import type { StoredCard } from '../src/lib/srs';

const AFTERNOON = new Date(2026, 10, 7, 17, 30); // 7 de noviembre de 2026, 5:30 p. m. (hora local)
const HOUR = 19;
const TIME = { hour: HOUR, minute: 0 };

function card(due: Date): StoredCard {
  return { due: due.toISOString(), stability: 3, difficulty: 5, elapsed_days: 1, scheduled_days: 1, learning_steps: 0, reps: 2, lapses: 0, state: 2 };
}

function progressWith(change: (p: Progress) => void): Progress {
  const p = freshProgress();
  change(p);
  return p;
}

const day = (offset: number) => dayKey(addDays(AFTERNOON, offset));

describe('avisos del recordatorio local', () => {
  it('programa las 7:43 de hoy aunque ya sean las 7:42, sin segundos ni milisegundos', () => {
    const now = new Date(2026, 10, 7, 7, 42, 59, 999);
    const plan = planLocalReminders(freshProgress(), { hour: 7, minute: 43 }, now);
    expect(plan).toHaveLength(DAYS_AHEAD);
    plan.forEach((r, i) => {
      expect(dayKey(r.at)).toBe(day(i));
      expect([r.at.getHours(), r.at.getMinutes(), r.at.getSeconds(), r.at.getMilliseconds()]).toEqual([7, 43, 0, 0]);
    });
  });

  it.each([new Date(2026, 10, 7, 7, 43), new Date(2026, 10, 7, 7, 43, 0, 1), new Date(2026, 10, 7, 7, 44)])(
    'empieza mañana si las 7:43 ya llegaron (%s)',
    (now) => {
      const plan = planLocalReminders(freshProgress(), { hour: 7, minute: 43 }, now);
      expect(plan[0].at).toEqual(new Date(2026, 10, 8, 7, 43));
    },
  );

  it('omite el aviso de las 7:43 de hoy si ya practicaste', () => {
    const p = progressWith((q) => { q.log[day(0)] = { h: 1 }; });
    expect(planLocalReminders(p, { hour: 7, minute: 43 }, new Date(2026, 10, 7, 7, 40))[0].at)
      .toEqual(new Date(2026, 10, 8, 7, 43));
  });

  it('permite las 23:59 y las 00:00 sin cambiar el día equivocado', () => {
    const now = new Date(2026, 10, 7, 23, 58);
    expect(planLocalReminders(freshProgress(), { hour: 23, minute: 59 }, now)[0].at).toEqual(new Date(2026, 10, 7, 23, 59));
    expect(planLocalReminders(freshProgress(), { hour: 0, minute: 0 }, now)[0].at).toEqual(new Date(2026, 10, 8, 0, 0));
  });

  it('cambiar solo los minutos cambia la firma para reprogramar los avisos', () => {
    const p = freshProgress();
    expect(planSignature(planLocalReminders(p, { hour: 19, minute: 43 }, AFTERNOON)))
      .not.toBe(planSignature(planLocalReminders(p, { hour: 19, minute: 42 }, AFTERNOON)));
  });

  it('rechaza entradas inválidas antes de intentar crear un plan', () => {
    const p = freshProgress();
    expect(() => planLocalReminders(p, { hour: 7, minute: 60 }, AFTERNOON)).toThrow(RangeError);
    expect(() => planLocalReminders(p, TIME, new Date(NaN))).toThrow(RangeError);
    for (const days of [-1, Infinity, NaN, 1.5, DAYS_AHEAD + 1]) {
      expect(() => planLocalReminders(p, TIME, AFTERNOON, days)).toThrow(RangeError);
    }
    expect(planLocalReminders(p, TIME, AFTERNOON, 0)).toEqual([]);
  });

  it('programa dos semanas, uno por día, a la hora en punto', () => {
    const plan = planLocalReminders(freshProgress(), TIME, AFTERNOON);
    expect(plan).toHaveLength(DAYS_AHEAD);
    plan.forEach((r, i) => {
      expect(r.id).toBe(FIRST_ID + i);
      expect(dayKey(r.at)).toBe(day(i));
      expect([r.at.getHours(), r.at.getMinutes(), r.at.getSeconds()]).toEqual([HOUR, 0, 0]);
    });
  });

  it('avisa hoy si todavía no practicaste y la hora no ha pasado', () => {
    const [first] = planLocalReminders(freshProgress(), TIME, AFTERNOON);
    expect(dayKey(first.at)).toBe(day(0));
    expect(first.title).toBe('Xi Bao te espera para practicar');
  });

  it('no avisa hoy si ya practicaste', () => {
    const p = progressWith((p) => {
      p.log[day(0)] = { r: 4 };
    });
    const plan = planLocalReminders(p, TIME, AFTERNOON);
    expect(dayKey(plan[0].at)).toBe(day(1));
    expect(plan).toHaveLength(DAYS_AHEAD);
  });

  it('empieza mañana si la hora de hoy ya pasó, también justo a la hora', () => {
    expect(dayKey(planLocalReminders(freshProgress(), TIME, new Date(2026, 10, 7, 21, 0))[0].at)).toBe(day(1));
    expect(dayKey(planLocalReminders(freshProgress(), TIME, new Date(2026, 10, 7, HOUR, 0))[0].at)).toBe(day(1));
  });

  it('cada día dice lo que corresponde si no vuelves a practicar', () => {
    const p = progressWith((p) => {
      p.log[day(-1)] = { r: 10 };
      p.log[day(0)] = { r: 10 };
      p.decks.read['1'] = card(new Date(addDays(AFTERNOON, 3).getTime() + 8 * 3_600_000)); // vence en 3 días
      p.settings.newPerDay = 0;
    });
    const plan = planLocalReminders(p, TIME, AFTERNOON);
    // Mañana la racha de 2 días está en juego; pasado mañana ya se habría perdido.
    expect(plan[0].title).toBe('No pierdas tu racha de 2 días');
    expect(plan[1].title).toBe('Xi Bao te espera para practicar');
    // La tarjeta aparece el día que vence, no antes.
    expect(plan[1].body).toBe('Practica un rato en Escribir o Hablar.');
    expect(plan[2].body).toBe('Tienes 1 tarjeta para repasar.');
  });

  it('solo cambia de plan si cambia algo que se ve en los avisos', () => {
    const p = freshProgress();
    const before = planSignature(planLocalReminders(p, TIME, AFTERNOON));
    expect(planSignature(planLocalReminders(p, TIME, new Date(AFTERNOON.getTime() + 60_000)))).toBe(before);
    const studied = progressWith((q) => {
      q.log[day(0)] = { r: 1 };
    });
    expect(planSignature(planLocalReminders(studied, TIME, AFTERNOON))).not.toBe(before);
    expect(planSignature(planLocalReminders(p, { ...TIME, hour: HOUR + 1 }, AFTERNOON))).not.toBe(before);
  });

  it('cancela todos los ids que pudo programar, sin tocar el de la prueba', () => {
    const ids = plannedIds();
    expect(ids).toHaveLength(DAYS_AHEAD);
    for (const r of planLocalReminders(freshProgress(), TIME, AFTERNOON)) expect(ids).toContain(r.id);
    expect(ids).not.toContain(TEST_ID);
  });
});

describe('hora guardada en este dispositivo', () => {
  it('conserva recordatorios antiguos sin minutos como horas en punto', () => {
    expect(normalizeLocalReminder({ hour: 19 })).toEqual({ hour: 19, minute: 0 });
    expect(normalizeLocalReminder({ hour: 0 })).toEqual({ hour: 0, minute: 0 });
  });

  it('conserva la hora y el minuto elegidos', () => {
    expect(normalizeLocalReminder({ hour: 7, minute: 43 })).toEqual({ hour: 7, minute: 43 });
    expect(normalizeLocalReminder({ hour: 23, minute: 59 })).toEqual({ hour: 23, minute: 59 });
  });

  it.each([
    undefined, null, [], {}, { hour: -1 }, { hour: 24 }, { hour: 7.5 }, { hour: '7' },
    { hour: NaN }, { hour: Infinity }, { hour: 7, minute: -1 }, { hour: 7, minute: 60 },
    { hour: 7, minute: 43.5 }, { hour: 7, minute: NaN }, { hour: 7, minute: '43' },
    { hour: 7, minute: null },
  ])('descarta configuraciones inválidas: %j', (raw) => {
    expect(normalizeLocalReminder(raw)).toBeUndefined();
  });
});
