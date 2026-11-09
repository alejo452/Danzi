import { describe, expect, it } from 'vitest';
import { freshProgress, MAX_SHIELDS, type Progress } from '../src/lib/progress';
import type { StoredCard } from '../src/lib/srs';
import { hasActivity, mergeProgress, newerCard, sameProgress, stableStringify } from '../src/lib/sync';

const card = (reviewedDay: number, reps = 1): StoredCard => ({
  due: `2026-11-${String(reviewedDay + 1).padStart(2, '0')}T00:00:00.000Z`,
  stability: 1,
  difficulty: 5,
  elapsed_days: 0,
  scheduled_days: 1,
  learning_steps: 0,
  reps,
  lapses: 0,
  state: 2,
  last_review: `2026-11-${String(reviewedDay).padStart(2, '0')}T12:00:00.000Z`,
});

/** Un progreso con algunos cambios encima del inicial. */
const prog = (patch: (p: Progress) => void, updatedAt = 1000): Progress => {
  const p = freshProgress();
  p.updatedAt = updatedAt;
  patch(p);
  return p;
};

const clone = (p: Progress): Progress => JSON.parse(JSON.stringify(p));

describe('comparar progresos', () => {
  it('el orden de las claves no importa', () => {
    expect(stableStringify({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: null } })).toBe(stableStringify({ a: { c: null, d: [1, { x: 1, y: 2 }] }, b: 1 }));
    expect(sameProgress(prog((p) => (p.log = { '2026-11-01': { r: 1, c: 1 } })), prog((p) => (p.log = { '2026-11-01': { c: 1, r: 1 } })))).toBe(true);
  });

  it('de dos versiones de una tarjeta gana la repasada más recientemente', () => {
    expect(newerCard(card(5), card(7))).toEqual(card(7));
    expect(newerCard(card(7), card(5))).toEqual(card(7));
    const { last_review: _a, ...sinFecha } = card(5);
    expect(newerCard(sinFecha, card(3))).toEqual(card(3));
    expect(newerCard(card(5, 2), card(5, 4))).toEqual(card(5, 4));
  });

  it('sabe si un progreso tiene algo hecho', () => {
    expect(hasActivity(freshProgress())).toBe(false);
    expect(hasActivity(prog((p) => (p.decks.read['1'] = card(1))))).toBe(true);
    expect(hasActivity(prog((p) => (p.rewards.coins = 3)))).toBe(true);
  });
});

describe('sincronizar con base (tres vías)', () => {
  const base = prog((p) => {
    p.decks.read = { '1': card(1), '2': card(1) };
    p.log = { '2026-11-01': { r: 10, n: 2, c: 14 } };
    p.rewards.coins = 30;
    p.rewards.shields = 1;
  });

  it('si este dispositivo no cambió nada, queda exactamente lo de la nube', () => {
    const remote = clone(base);
    remote.decks.read['3'] = card(2);
    remote.log['2026-11-02'] = { r: 4, c: 4 };
    remote.rewards.coins = 34;
    remote.updatedAt = 2000;
    expect(sameProgress(mergeProgress(base, clone(base), remote), remote)).toBe(true);
  });

  it('si la nube no cambió, queda exactamente lo de este dispositivo', () => {
    const local = clone(base);
    local.decks.write['1'] = card(2);
    local.settings.newPerDay = 15;
    local.updatedAt = 2000;
    expect(sameProgress(mergeProgress(base, local, clone(base)), local)).toBe(true);
  });

  it('junta tarjetas cambiadas en dos dispositivos: cada una con su repaso más reciente', () => {
    const local = clone(base);
    local.decks.read['1'] = card(3);
    local.decks.read['4'] = card(3);
    const remote = clone(base);
    remote.decks.read['1'] = card(2);
    remote.decks.read['2'] = card(4);
    remote.decks.read['5'] = card(4);
    const m = mergeProgress(base, local, remote);
    expect(m.decks.read).toEqual({ '1': card(3), '2': card(4), '4': card(3), '5': card(4) });
  });

  it('suma la práctica del mismo día en dos dispositivos', () => {
    const local = clone(base);
    local.log['2026-11-01'] = { r: 15, n: 3, c: 20 };
    local.log['2026-11-02'] = { h: 2, c: 2 };
    const remote = clone(base);
    remote.log['2026-11-01'] = { r: 12, n: 2, w: 3, c: 17 };
    const m = mergeProgress(base, local, remote);
    expect(m.log['2026-11-01']).toEqual({ r: 17, n: 3, w: 3, c: 23 });
    expect(m.log['2026-11-02']).toEqual({ h: 2, c: 2 });
  });

  it('suma las monedas ganadas y gastadas en cada dispositivo, sin bajar de cero', () => {
    const local = clone(base);
    local.rewards.coins = 35; // ganó 5
    const remote = clone(base);
    remote.rewards.coins = 33; // ganó 3
    expect(mergeProgress(base, local, remote).rewards.coins).toBe(38);
    local.rewards.coins = 5; // gastó 25 en un tema
    expect(mergeProgress(base, local, remote).rewards.coins).toBe(8);
    local.rewards.coins = 0;
    remote.rewards.coins = 0;
    expect(mergeProgress(base, local, remote).rewards.coins).toBe(0);
  });

  it('los protectores también se suman, hasta el máximo', () => {
    const local = clone(base);
    local.rewards.shields = 2;
    const remote = clone(base);
    remote.rewards.shields = 2;
    expect(mergeProgress(base, local, remote).rewards.shields).toBe(MAX_SHIELDS);
  });

  it('une sellos, sobres, días salvados y temas comprados', () => {
    const local = clone(base);
    local.rewards.seals = { racha3: '2026-11-03', palabras100: '2026-11-04' };
    local.rewards.envelopes = { '2026-11-03': 20 };
    local.rewards.shielded = ['2026-11-02'];
    local.rewards.themes = ['laca', 'jade'];
    const remote = clone(base);
    remote.rewards.seals = { racha3: '2026-11-02' };
    remote.rewards.envelopes = { '2026-11-04': 30 };
    remote.rewards.shielded = ['2026-10-30'];
    remote.rewards.themes = ['laca', 'tinta'];
    const r = mergeProgress(base, local, remote).rewards;
    expect(r.seals).toEqual({ racha3: '2026-11-02', palabras100: '2026-11-04' });
    expect(r.envelopes).toEqual({ '2026-11-03': 20, '2026-11-04': 30 });
    expect(r.shielded).toEqual(['2026-10-30', '2026-11-02']);
    expect(r.themes.sort()).toEqual(['jade', 'laca', 'tinta']);
  });

  it('ajustes: toma lo que cambió en cada lado; si cambió lo mismo, gana este dispositivo', () => {
    const local = clone(base);
    local.settings.newPerDay = 15;
    local.settings.autoSpeak = true;
    const remote = clone(base);
    remote.settings.dailyGoal = 30;
    remote.settings.autoSpeak = false;
    remote.settings.levels = ['1', '2'];
    remote.settings.newPerDay = 20;
    const s = mergeProgress(base, local, remote).settings;
    expect(s).toEqual({ ...base.settings, newPerDay: 15, autoSpeak: true, dailyGoal: 30, levels: ['1', '2'] });
  });

  it('el tema activo sale del lado que lo cambió', () => {
    const local = clone(base);
    const remote = clone(base);
    remote.rewards.themes = ['laca', 'jade'];
    remote.rewards.theme = 'jade';
    expect(mergeProgress(base, local, remote).rewards.theme).toBe('jade');
    local.rewards.themes = ['laca', 'tinta'];
    local.rewards.theme = 'tinta';
    expect(mergeProgress(base, local, remote).rewards.theme).toBe('tinta');
  });

  it('borrar el progreso en un dispositivo lo borra en la nube, si allá no cambió nada', () => {
    const local = { ...freshProgress(), settings: base.settings, updatedAt: 3000 };
    const m = mergeProgress(base, local, clone(base));
    expect(m.decks.read).toEqual({});
    expect(m.log).toEqual({});
    expect(m.rewards.coins).toBe(0);
  });

  it('pero no borra lo que se practicó en otro dispositivo después', () => {
    const local = { ...freshProgress(), settings: base.settings, updatedAt: 3000 };
    const remote = clone(base);
    remote.decks.read['2'] = card(5);
    const m = mergeProgress(base, local, remote);
    expect(m.decks.read).toEqual({ '2': card(5) });
  });

  it('el cupo extra del mismo día se suma', () => {
    const b = prog((p) => (p.extra = { date: '2026-11-05', read: 5, write: 0 }));
    const local = clone(b);
    local.extra.read = 10;
    const remote = clone(b);
    remote.extra.read = 15;
    expect(mergeProgress(b, local, remote).extra).toEqual({ date: '2026-11-05', read: 20, write: 0 });
    remote.extra = { date: '2026-11-06', read: 5, write: 0 };
    expect(mergeProgress(b, local, remote).extra).toEqual({ date: '2026-11-06', read: 5, write: 0 });
  });

  it('juntar dos veces lo mismo no cambia nada', () => {
    const local = clone(base);
    local.decks.read['9'] = card(9);
    local.log['2026-11-09'] = { r: 3, c: 3 };
    const remote = clone(base);
    remote.decks.read['8'] = card(8);
    const once = mergeProgress(base, local, remote);
    expect(sameProgress(mergeProgress(once, once, once), once)).toBe(true);
  });
});

describe('primera sincronización (sin base)', () => {
  it('toma lo mayor de cada lado: nada se pierde ni se cuenta dos veces', () => {
    const shared = prog((p) => {
      p.decks.read = { '1': card(1) };
      p.log = { '2026-11-01': { r: 10, c: 12 } };
      p.rewards.coins = 40;
      p.rewards.seals = { racha3: '2026-11-01' };
    });
    // El mismo progreso pasado con un archivo, y después cada dispositivo siguió por su lado.
    const local = clone(shared);
    local.decks.read['1'] = card(4);
    local.log['2026-11-04'] = { r: 5, c: 5 };
    local.rewards.coins = 45;
    local.updatedAt = 4000;
    const remote = clone(shared);
    remote.decks.read['2'] = card(3);
    remote.rewards.coins = 42;
    remote.rewards.themes = ['laca', 'jade'];
    remote.updatedAt = 3000;
    const m = mergeProgress(undefined, local, remote);
    expect(m.decks.read).toEqual({ '1': card(4), '2': card(3) });
    expect(m.log).toEqual({ '2026-11-01': { r: 10, c: 12 }, '2026-11-04': { r: 5, c: 5 } });
    expect(m.rewards.coins).toBe(45);
    expect(m.rewards.seals).toEqual({ racha3: '2026-11-01' });
    expect(m.rewards.themes.sort()).toEqual(['jade', 'laca']);
    expect(m.updatedAt).toBe(4000);
  });

  it('los ajustes salen del progreso cambiado más recientemente', () => {
    const local = prog((p) => (p.settings.newPerDay = 5), 100);
    const remote = prog((p) => (p.settings.newPerDay = 20), 200);
    expect(mergeProgress(undefined, local, remote).settings.newPerDay).toBe(20);
    local.updatedAt = 300;
    expect(mergeProgress(undefined, local, remote).settings.newPerDay).toBe(5);
  });
});
