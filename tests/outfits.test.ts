import { describe, expect, it } from 'vitest';
import { buyOutfit, DEFAULT_OUTFIT, OUTFITS, selectOutfit } from '../src/lib/outfits';
import { freshProgress, normalizeProgress, PROGRESS_VERSION, type Progress } from '../src/lib/progress';
import { mergeProgress } from '../src/lib/sync';

const NOW = new Date('2026-11-09T15:00:00Z');
const withCoins = (coins: number): Progress => {
  const p = freshProgress();
  p.rewards.coins = coins;
  return p;
};
const bought = (p: Progress, id: string): Progress => {
  const result = buyOutfit(p, id, NOW);
  if (!result.ok) throw new Error(`No se pudo comprar ${id}: ${result.reason}`);
  return result.p;
};

describe('vestidor de Xi Bao', () => {
  it.each(OUTFITS.filter((item) => item.price > 0))('compra $name una vez, lo pone y descuenta su precio', (item) => {
    const p = withCoins(item.price);
    p.log = { '2026-11-09': { r: 12, c: item.price } };
    const result = bought(p, item.id);
    expect(result.rewards).toMatchObject({ coins: 0, outfit: item.id, outfits: [DEFAULT_OUTFIT, item.id] });
    expect(result.updatedAt).toBe(NOW.getTime());
    expect(result.log).toEqual(p.log);
    expect(result.decks).toEqual(p.decks);
    expect(p.rewards.coins).toBe(item.price);
    expect(p.rewards.outfits).toEqual([DEFAULT_OUTFIT]);
    expect(buyOutfit(result, item.id, NOW)).toEqual({ ok: false, reason: 'owned' });
  });

  it('rechaza compras desconocidas, ya compradas o sin saldo suficiente', () => {
    const p = withCoins(79);
    const before = structuredClone(p);
    expect(buyOutfit(p, 'pijama', NOW)).toEqual({ ok: false, reason: 'coins', missing: 1 });
    expect(buyOutfit(p, 'inexistente', NOW)).toEqual({ ok: false, reason: 'unknown' });
    expect(buyOutfit(p, DEFAULT_OUTFIT, NOW)).toEqual({ ok: false, reason: 'owned' });
    expect(p).toEqual(before);
  });

  it('cambia gratis entre atuendos comprados, pero no se pone uno sin comprar', () => {
    const p = bought(bought(withCoins(500), 'explorador'), 'pijama');
    const changed = selectOutfit(p, 'explorador', NOW);
    expect(changed.rewards.outfit).toBe('explorador');
    expect(changed.rewards.coins).toBe(p.rewards.coins);
    expect(selectOutfit(changed, DEFAULT_OUTFIT, NOW).rewards.outfit).toBe(DEFAULT_OUTFIT);
    expect(selectOutfit(changed, 'festival', NOW)).toBe(changed);
    expect(selectOutfit(changed, 'inexistente', NOW)).toBe(changed);
    expect(selectOutfit(changed, 'explorador', NOW)).toBe(changed);
  });
});

describe('guardar y migrar el vestidor', () => {
  it('migra la versión 2 sin cambiar tarjetas, ajustes, racha, monedas ni premios', () => {
    const current = withCoins(235);
    const card = {
      due: NOW.toISOString(), stability: 3, difficulty: 5, elapsed_days: 1,
      scheduled_days: 3, learning_steps: 0, reps: 2, lapses: 0, state: 2,
    };
    current.decks = { read: { '1': card }, write: { '2': { ...card, reps: 3 } } };
    current.log = { '2026-11-08': { r: 5, w: 2, h: 1, c: 17 } };
    current.settings.dailyGoal = 30;
    current.extra = { date: '2026-11-08', read: 3, write: 2 };
    current.rewards.seals = { inicio: '2026-11-07' };
    current.rewards.envelopes = { '2026-11-08': 17 };
    current.rewards.shields = 2;
    current.rewards.shielded = ['2026-11-06'];
    current.rewards.themes = ['laca', 'jade'];
    current.rewards.theme = 'jade';
    current.updatedAt = 123;
    const { outfit: _outfit, outfits: _outfits, ...oldRewards } = current.rewards;
    const v2 = { ...current, v: 2, rewards: oldRewards };
    expect(normalizeProgress(v2)).toEqual({ ...current, v: PROGRESS_VERSION });
    expect(v2.rewards).not.toHaveProperty('outfits');
  });

  it('normaliza datos incompletos o inválidos sin permitir un atuendo sin comprar', () => {
    const p = normalizeProgress({ rewards: { outfits: ['pijama', 'pijama', 42, null, 'fantasma'], outfit: 'festival' } });
    expect(p.rewards.outfits).toEqual([DEFAULT_OUTFIT, 'pijama']);
    expect(p.rewards.outfit).toBe(DEFAULT_OUTFIT);
    expect(normalizeProgress({ rewards: { outfits: 'pijama', outfit: 'pijama' } }).rewards.outfits).toEqual([DEFAULT_OUTFIT]);
  });

  it('conserva compras y selección al exportar y volver a importar el progreso', () => {
    const p = bought(bought(withCoins(500), 'festival'), 'pijama');
    expect(normalizeProgress(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });
});

describe('sincronizar atuendos', () => {
  it('une compras distintas y conserva ambos gastos y la elección local si ambos cambiaron', () => {
    const base = withCoins(500);
    const local = bought(base, 'explorador');
    const remote = bought(base, 'pijama');
    const result = mergeProgress(base, local, remote);
    expect(result.rewards.outfits).toEqual([DEFAULT_OUTFIT, 'explorador', 'pijama']);
    expect(result.rewards.coins).toBe(300);
    expect(result.rewards.outfit).toBe('explorador');
    expect(mergeProgress(result, result, result)).toEqual(result);
  });

  it('adopta el atuendo remoto si aquí no se cambió y permite volver al clásico', () => {
    const base = bought(withCoins(500), 'pijama');
    const remote = selectOutfit(base, DEFAULT_OUTFIT, NOW);
    expect(mergeProgress(base, base, remote).rewards.outfit).toBe(DEFAULT_OUTFIT);
    expect(mergeProgress(base, remote, base).rewards.outfit).toBe(DEFAULT_OUTFIT);
    expect(mergeProgress(base, base, remote).rewards.outfits).toEqual(base.rewards.outfits);
  });

  it.each([80, 500])('cobra una sola vez el mismo atuendo comprado sin conexión en dos dispositivos (saldo %i)', (coins) => {
    const base = withCoins(coins);
    const local = bought(base, 'pijama');
    const remote = bought(base, 'pijama');
    const result = mergeProgress(base, local, remote);
    expect(result.rewards.coins).toBe(coins - 80);
    expect(result.rewards.outfits).toEqual([DEFAULT_OUTFIT, 'pijama']);
    expect(mergeProgress(result, result, result)).toEqual(result);
  });

  it('no devuelve monedas por atuendos que ya estaban comprados en la base', () => {
    const base = bought(withCoins(500), 'pijama');
    const local = bought(base, 'explorador');
    const remote = bought(base, 'festival');
    expect(mergeProgress(base, local, remote).rewards.coins).toBe(120);
  });

  it('sin base une compras, toma el saldo mayor y usa la selección más reciente', () => {
    const local = bought(withCoins(500), 'pijama');
    const remote = bought(withCoins(500), 'festival');
    remote.updatedAt = local.updatedAt + 1;
    const result = mergeProgress(undefined, local, remote);
    expect(result.rewards.outfits).toEqual([DEFAULT_OUTFIT, 'pijama', 'festival']);
    expect(result.rewards.coins).toBe(420);
    expect(result.rewards.outfit).toBe('festival');
  });
});
