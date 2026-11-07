import { describe, expect, it } from 'vitest';
import { MINUTE } from '../src/lib/dates';
import { addExtraNew, freshProgress, newLeftToday, normalizeProgress, recordAnswer, streak } from '../src/lib/progress';
import { nextCard, queueCounts } from '../src/lib/queue';
import { previewAll, Rating, State, type StoredCard } from '../src/lib/srs';

const now = new Date('2026-11-07T10:00:00');

function card(state: State, dueOffsetMs: number, scheduled_days = 0): StoredCard {
  return {
    due: new Date(now.getTime() + dueOffsetMs).toISOString(),
    stability: 3,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days,
    learning_steps: 0,
    reps: 1,
    lapses: 0,
    state,
  };
}

describe('FSRS', () => {
  it('una palabra nueva vuelve en 1 minuto con "Otra vez" y en 10 con "Bien"', () => {
    const p = previewAll(undefined, now);
    expect(Date.parse(p[Rating.Again].due) - now.getTime()).toBe(1 * MINUTE);
    expect(Date.parse(p[Rating.Good].due) - now.getTime()).toBe(10 * MINUTE);
    expect(p[Rating.Easy].state).toBe(State.Review);
  });

  it('los intervalos crecen de "Otra vez" a "Fácil"', () => {
    const p = previewAll(card(State.Review, 0, 5), now);
    const due = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy].map((g) => Date.parse(p[g as 1 | 2 | 3 | 4].due));
    expect(due).toEqual([...due].sort((a, b) => a - b));
  });
});

describe('cola del día', () => {
  const deck = {
    a: card(State.Review, -60 * MINUTE, 3),
    b: card(State.Learning, -1 * MINUTE),
    c: card(State.Review, 3 * 24 * 60 * MINUTE, 3),
  };

  it('primero aprendizaje vencido, luego repasos, luego nuevas', () => {
    expect(nextCard(deck, ['n1'], 5, now)).toBe('b');
    const { b: _b, ...rest } = deck;
    expect(nextCard(rest, ['n1'], 5, now)).toBe('a');
    expect(nextCard({ c: deck.c }, ['n1'], 5, now)).toBe('n1');
    expect(nextCard({ c: deck.c }, ['n1'], 0, now)).toBeNull();
  });

  it('cuenta nuevas, aprendiendo y repasos de hoy', () => {
    expect(queueCounts(deck, ['n1', 'n2'], 1, now)).toEqual({ newLeft: 1, learn: 1, review: 1, total: 3 });
  });
});

describe('progreso', () => {
  it('registra respuestas y descuenta el cupo de nuevas', () => {
    let p = freshProgress();
    expect(newLeftToday(p, 'read', now)).toBe(10);
    p = recordAnswer(p, 'read', '1', card(State.Learning, MINUTE), now);
    p = recordAnswer(p, 'read', '1', card(State.Learning, 10 * MINUTE), now);
    expect(newLeftToday(p, 'read', now)).toBe(9);
    p = addExtraNew(p, 'read', 5, now);
    expect(newLeftToday(p, 'read', now)).toBe(14);
  });

  it('cuenta la racha de días seguidos', () => {
    const p = freshProgress();
    p.log = { '2026-11-05': { r: 3 }, '2026-11-06': { h: 1 }, '2026-11-07': { w: 2 } };
    expect(streak(p, now)).toBe(3);
    p.log = { '2026-11-05': { r: 3 }, '2026-11-06': { r: 1 } };
    expect(streak(p, now)).toBe(2);
  });

  it('acepta datos dañados sin romperse y conserva lo válido', () => {
    expect(normalizeProgress(null).decks.read).toEqual({});
    const kept = normalizeProgress({ decks: { read: { '5': card(State.Review, 0) } }, settings: { newPerDay: 20 } });
    expect(Object.keys(kept.decks.read)).toEqual(['5']);
    expect(kept.settings.newPerDay).toBe(20);
    expect(kept.settings.levels).toEqual(['1']);
  });
});
