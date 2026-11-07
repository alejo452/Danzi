// Monedas, sobre rojo, protectores de racha, sellos, tienda, calendario y la migración del progreso.
import { describe, expect, it } from 'vitest';
import { addDays, dayKey } from '../src/lib/dates';
import { EARN, freshProgress, normalizeProgress, PROGRESS_VERSION, recordAnswer, recordSpeaking, streak, type Progress } from '../src/lib/progress';
import {
  applyShields,
  bestStreak,
  buyShield,
  buyTheme,
  canOpenEnvelope,
  claimSeals,
  dayStatus,
  envelopeAmount,
  goalProgress,
  monthSummary,
  monthWeeks,
  nextStreakSeal,
  openEnvelope,
  pendingSeals,
  SEALS,
  selectTheme,
  SHIELD_PRICE,
  THEMES,
} from '../src/lib/rewards';
import { State, type StoredCard } from '../src/lib/srs';

const NOW = new Date(2026, 10, 7, 18, 0); // 7 de noviembre de 2026, 6:00 p. m.
const day = (offset: number) => dayKey(addDays(NOW, offset));

function card(state = State.Review, scheduled_days = 3): StoredCard {
  return { due: NOW.toISOString(), stability: 3, difficulty: 5, elapsed_days: 1, scheduled_days, learning_steps: 0, reps: 2, lapses: 0, state };
}

function withCoins(n: number): Progress {
  const p = freshProgress();
  p.rewards.coins = n;
  return p;
}

describe('migración del progreso', () => {
  it('convierte datos de la versión 1 sin perder nada y empieza las recompensas en cero', () => {
    const v1 = {
      v: 1,
      decks: { read: { '1': card() }, write: {} },
      settings: { levels: ['1', '2'], newPerDay: 15, newWritePerDay: 5, autoSpeak: true, pinyinFront: false },
      log: { '2026-11-06': { r: 12, n: 3 } },
      extra: { date: '2026-11-06', read: 5, write: 0 },
      updatedAt: 123,
    };
    const p = normalizeProgress(v1);
    expect(p.v).toBe(PROGRESS_VERSION);
    expect(p.v).toBe(2);
    expect(p.decks.read['1']).toEqual(v1.decks.read['1']);
    expect(p.settings).toEqual({ ...v1.settings, dailyGoal: 20 });
    expect(p.log).toEqual(v1.log);
    expect(p.extra).toEqual(v1.extra);
    expect(p.rewards).toEqual({ coins: 0, envelopes: {}, seals: {}, shields: 0, shielded: [], theme: 'laca', themes: ['laca'] });
    // Lo que ya habías logrado queda como sellos por recoger.
    expect(pendingSeals(p).map((s) => s.id)).toEqual(['inicio']);
  });

  it('conserva las recompensas y corrige valores dañados', () => {
    const p = normalizeProgress({
      rewards: {
        coins: 120.7,
        envelopes: { '2026-11-06': 18, ayer: 5 },
        seals: { inicio: '2026-11-01', roto: 3 },
        shields: 7,
        shielded: ['2026-11-05', 'nunca'],
        theme: 'oro',
        themes: ['jade'],
      },
      settings: { dailyGoal: -4 },
    });
    expect(p.rewards).toEqual({
      coins: 120,
      envelopes: { '2026-11-06': 18 },
      seals: { inicio: '2026-11-01' },
      shields: 2,
      shielded: ['2026-11-05'],
      theme: 'laca', // «oro» no está comprado
      themes: ['laca', 'jade'],
    });
    expect(p.settings.dailyGoal).toBe(20);
    expect(normalizeProgress({ rewards: { coins: -5 } }).rewards.coins).toBe(0);
  });
});

describe('monedas por practicar', () => {
  it('da 1 por tarjeta y 2 más por cada palabra nueva', () => {
    let p = recordAnswer(freshProgress(), 'read', '1', card(State.Learning), NOW);
    expect(p.rewards.coins).toBe(EARN.card + EARN.newWord);
    p = recordAnswer(p, 'read', '1', card(), NOW);
    expect(p.rewards.coins).toBe(2 * EARN.card + EARN.newWord);
    expect(p.log[day(0)].c).toBe(p.rewards.coins);
  });

  it('tiene tope diario por tarjetas, pero las palabras nuevas siempre suman', () => {
    let p = freshProgress();
    p.log[day(0)] = { r: EARN.cardCap };
    p = recordAnswer(p, 'read', '1', card(), NOW); // nueva, pasado el tope
    expect(p.rewards.coins).toBe(EARN.newWord);
    p = recordAnswer(p, 'read', '1', card(), NOW); // repetida, pasado el tope
    expect(p.rewards.coins).toBe(EARN.newWord);
  });

  it('suma por escribir y por hablar, con sus topes', () => {
    let p = recordAnswer(freshProgress(), 'write', '7', card(), NOW);
    expect(p.rewards.coins).toBe(EARN.write + EARN.newWrite);
    p.log[day(0)] = { ...p.log[day(0)], h: EARN.speakCap - 1 };
    p = recordSpeaking(p, NOW);
    expect(p.rewards.coins).toBe(EARN.write + EARN.newWrite + EARN.speak);
    p = recordSpeaking(p, NOW);
    expect(p.rewards.coins).toBe(EARN.write + EARN.newWrite + EARN.speak);
  });
});

describe('meta diaria y sobre rojo', () => {
  it('se abre una sola vez al cumplir la meta, y siempre trae lo mismo ese día', () => {
    let p = freshProgress();
    p.settings.dailyGoal = 10;
    p.log[day(0)] = { r: 6, w: 3 };
    expect(goalProgress(p, NOW)).toEqual({ done: 9, goal: 10, reached: false });
    expect(canOpenEnvelope(p, NOW)).toBe(false);
    expect(openEnvelope(p, NOW).amount).toBe(0);

    p = recordSpeaking(p, NOW);
    expect(canOpenEnvelope(p, NOW)).toBe(true);
    const before = p.rewards.coins;
    const opened = openEnvelope(p, NOW);
    expect(opened.amount).toBe(envelopeAmount(day(0)));
    expect(opened.amount).toBeGreaterThanOrEqual(10);
    expect(opened.amount).toBeLessThanOrEqual(25);
    expect(opened.p.rewards.coins).toBe(before + opened.amount);
    expect(canOpenEnvelope(opened.p, NOW)).toBe(false);
    expect(openEnvelope(opened.p, NOW).amount).toBe(0);
  });

  it('reparte montos distintos entre días y olvida los sobres muy viejos', () => {
    const amounts = new Set(Array.from({ length: 30 }, (_, i) => envelopeAmount(day(-i))));
    expect(amounts.size).toBeGreaterThan(5);
    const p = freshProgress();
    p.rewards.envelopes = { [day(-200)]: 12, [day(-3)]: 15 };
    p.log[day(0)] = { r: 20 };
    expect(Object.keys(openEnvelope(p, NOW).p.rewards.envelopes).sort()).toEqual([day(-3), day(0)]);
  });
});

describe('racha y protectores', () => {
  function streakOf(days: number[]): Progress {
    const p = freshProgress();
    for (const d of days) p.log[day(d)] = { r: 5 };
    return p;
  }

  it('un protector salva un día sin práctica, que une la racha pero no suma', () => {
    const p = streakOf([-5, -4, -3, -2]); // ayer no practicó
    p.rewards.shields = 1;
    expect(streak(p, NOW)).toBe(0);
    const r = applyShields(p, NOW);
    expect(r.used).toBe(1);
    expect(r.p.rewards.shields).toBe(0);
    expect(r.p.rewards.shielded).toEqual([day(-1)]);
    expect(streak(r.p, NOW)).toBe(4);
    r.p.log[day(0)] = { r: 1 };
    expect(streak(r.p, NOW)).toBe(5);
    expect(applyShields(r.p, NOW).used).toBe(0); // ya no hay hueco
  });

  it('no gasta protectores si no alcanzan o si no hay racha que salvar', () => {
    const gap2 = streakOf([-6, -5, -4, -3]); // faltan ayer y anteayer
    gap2.rewards.shields = 1;
    expect(applyShields(gap2, NOW).used).toBe(0);
    gap2.rewards.shields = 2;
    expect(applyShields(gap2, NOW).used).toBe(2);
    const empty = freshProgress();
    empty.rewards.shields = 2;
    expect(applyShields(empty, NOW).used).toBe(0);
  });

  it('calcula la mejor racha, con los días protegidos uniendo tramos', () => {
    const p = streakOf([-20, -19, -18, -10, -9, -7, -6, -5]);
    expect(bestStreak(p)).toBe(3);
    p.rewards.shielded = [day(-8)];
    expect(bestStreak(p)).toBe(5);
  });
});

describe('tienda', () => {
  it('vende protectores hasta tener dos', () => {
    expect(buyShield(withCoins(SHIELD_PRICE - 1), NOW)).toEqual({ ok: false, reason: 'coins', missing: 1 });
    const r = buyShield(withCoins(SHIELD_PRICE * 3), NOW);
    expect(r.ok && r.p.rewards).toMatchObject({ coins: SHIELD_PRICE * 2, shields: 1 });
    const full = withCoins(500);
    full.rewards.shields = 2;
    expect(buyShield(full, NOW)).toEqual({ ok: false, reason: 'max' });
  });

  it('vende temas una vez y los deja activos', () => {
    const jade = THEMES.find((t) => t.id === 'jade')!;
    expect(buyTheme(withCoins(10), 'jade', NOW)).toEqual({ ok: false, reason: 'coins', missing: jade.price - 10 });
    const r = buyTheme(withCoins(jade.price), 'jade', NOW);
    expect(r.ok && r.p.rewards).toMatchObject({ coins: 0, theme: 'jade', themes: ['laca', 'jade'] });
    if (!r.ok) return;
    expect(buyTheme(r.p, 'jade', NOW)).toEqual({ ok: false, reason: 'owned' });
    expect(buyTheme(r.p, 'neon', NOW)).toEqual({ ok: false, reason: 'unknown' });
    expect(selectTheme(r.p, 'laca', NOW).rewards.theme).toBe('laca');
    expect(selectTheme(r.p, 'oro', NOW).rewards.theme).toBe('jade'); // no comprado
  });
});

describe('sellos', () => {
  it('tienen ids únicos y metas alcanzables', () => {
    expect(new Set(SEALS.map((s) => s.id)).size).toBe(SEALS.length);
    for (const s of SEALS) {
      expect(s.goal, s.id).toBeGreaterThan(0);
      expect(s.coins, s.id).toBeGreaterThan(0);
      expect(s.hz, s.id).toMatch(/^\p{Script=Han}{1,3}$/u);
    }
  });

  it('se recogen una sola vez y dan sus monedas', () => {
    let p = freshProgress();
    for (let i = 1; i <= 10; i++) p = recordAnswer(p, 'read', String(i), card(), NOW);
    expect(pendingSeals(p).map((s) => s.id)).toEqual(['inicio', 'diez']);
    const before = p.rewards.coins;
    const r = claimSeals(p, ['inicio', 'diez', 'cien'], NOW);
    expect(r.coins).toBe(10 + 20);
    expect(r.p.rewards.coins).toBe(before + 30);
    expect(r.p.rewards.seals).toEqual({ inicio: day(0), diez: day(0) });
    expect(pendingSeals(r.p)).toEqual([]);
    expect(claimSeals(r.p, ['inicio'], NOW).coins).toBe(0);
  });

  it('cuenta rachas, niveles completos y días completos', () => {
    const p = freshProgress();
    for (let d = -6; d <= 0; d++) p.log[day(d)] = { r: 1 };
    p.log[day(0)] = { r: 1, w: 1, h: 1 };
    for (let id = 301; id <= 500; id++) p.decks.read[String(id)] = card();
    const ids = pendingSeals(p).map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(['racha3', 'racha7', 'completo', 'voz', 'hsk2', 'cien']));
    expect(ids).not.toContain('hsk1');
    expect(nextStreakSeal(p, 7)?.seal.id).toBe('racha30');
    expect(nextStreakSeal(p, 7)?.left).toBe(23);
  });
});

describe('calendario', () => {
  it('arma las semanas de lunes a domingo', () => {
    const nov = monthWeeks(2026, 10); // el 1 de noviembre de 2026 es domingo
    expect(nov).toHaveLength(6);
    expect(nov[0][0]).toEqual({ key: '2026-10-26', day: 26, inMonth: false });
    expect(nov[0][6]).toEqual({ key: '2026-11-01', day: 1, inMonth: true });
    expect(nov[5][0].key).toBe('2026-11-30');
    expect(monthWeeks(2027, 1)).toHaveLength(4); // febrero de 2027 empieza en lunes
  });

  it('marca cada día y resume el mes', () => {
    const p = freshProgress();
    p.log[day(-2)] = { r: 3, c: 5 };
    p.log[day(-1)] = { h: 1, c: 2 };
    p.rewards.shielded = [day(-3)];
    expect(dayStatus(p, day(-2), day(0))).toBe('practiced');
    expect(dayStatus(p, day(-3), day(0))).toBe('shielded');
    expect(dayStatus(p, day(-4), day(0))).toBe('missed');
    expect(dayStatus(p, day(0), day(0))).toBe('today');
    expect(dayStatus(p, day(1), day(0))).toBe('future');
    expect(monthSummary(p, 2026, 10)).toEqual({ days: 2, coins: 7 });
  });
});
