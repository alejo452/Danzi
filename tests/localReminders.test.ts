// Recordatorio de la APK de Android: qué avisos programa el celular y con qué texto.
import { describe, expect, it } from 'vitest';
import { addDays, dayKey } from '../src/lib/dates';
import { DAYS_AHEAD, FIRST_ID, TEST_ID, planLocalReminders, planSignature, plannedIds } from '../src/lib/localReminders';
import { freshProgress, type Progress } from '../src/lib/progress';
import type { StoredCard } from '../src/lib/srs';

const AFTERNOON = new Date(2026, 10, 7, 17, 30); // 7 de noviembre de 2026, 5:30 p. m. (hora local)
const HOUR = 19;

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
  it('programa dos semanas, uno por día, a la hora en punto', () => {
    const plan = planLocalReminders(freshProgress(), HOUR, AFTERNOON);
    expect(plan).toHaveLength(DAYS_AHEAD);
    plan.forEach((r, i) => {
      expect(r.id).toBe(FIRST_ID + i);
      expect(dayKey(r.at)).toBe(day(i));
      expect([r.at.getHours(), r.at.getMinutes(), r.at.getSeconds()]).toEqual([HOUR, 0, 0]);
    });
  });

  it('avisa hoy si todavía no practicaste y la hora no ha pasado', () => {
    const [first] = planLocalReminders(freshProgress(), HOUR, AFTERNOON);
    expect(dayKey(first.at)).toBe(day(0));
    expect(first.title).toBe('Es hora de practicar chino');
  });

  it('no avisa hoy si ya practicaste', () => {
    const p = progressWith((p) => {
      p.log[day(0)] = { r: 4 };
    });
    const plan = planLocalReminders(p, HOUR, AFTERNOON);
    expect(dayKey(plan[0].at)).toBe(day(1));
    expect(plan).toHaveLength(DAYS_AHEAD);
  });

  it('empieza mañana si la hora de hoy ya pasó, también justo a la hora', () => {
    expect(dayKey(planLocalReminders(freshProgress(), HOUR, new Date(2026, 10, 7, 21, 0))[0].at)).toBe(day(1));
    expect(dayKey(planLocalReminders(freshProgress(), HOUR, new Date(2026, 10, 7, HOUR, 0))[0].at)).toBe(day(1));
  });

  it('cada día dice lo que corresponde si no vuelves a practicar', () => {
    const p = progressWith((p) => {
      p.log[day(-1)] = { r: 10 };
      p.log[day(0)] = { r: 10 };
      p.decks.read['1'] = card(new Date(addDays(AFTERNOON, 3).getTime() + 8 * 3_600_000)); // vence en 3 días
      p.settings.newPerDay = 0;
    });
    const plan = planLocalReminders(p, HOUR, AFTERNOON);
    // Mañana la racha de 2 días está en juego; pasado mañana ya se habría perdido.
    expect(plan[0].title).toBe('No pierdas tu racha de 2 días');
    expect(plan[1].title).toBe('Es hora de practicar chino');
    // La tarjeta aparece el día que vence, no antes.
    expect(plan[1].body).toBe('Practica un rato en Escribir o Hablar.');
    expect(plan[2].body).toBe('Tienes 1 tarjeta para repasar.');
  });

  it('solo cambia de plan si cambia algo que se ve en los avisos', () => {
    const p = freshProgress();
    const before = planSignature(planLocalReminders(p, HOUR, AFTERNOON));
    expect(planSignature(planLocalReminders(p, HOUR, new Date(AFTERNOON.getTime() + 60_000)))).toBe(before);
    const studied = progressWith((q) => {
      q.log[day(0)] = { r: 1 };
    });
    expect(planSignature(planLocalReminders(studied, HOUR, AFTERNOON))).not.toBe(before);
    expect(planSignature(planLocalReminders(p, HOUR + 1, AFTERNOON))).not.toBe(before);
  });

  it('cancela todos los ids que pudo programar, sin tocar el de la prueba', () => {
    const ids = plannedIds();
    expect(ids).toHaveLength(DAYS_AHEAD);
    for (const r of planLocalReminders(freshProgress(), HOUR, AFTERNOON)) expect(ids).toContain(r.id);
    expect(ids).not.toContain(TEST_ID);
  });
});
