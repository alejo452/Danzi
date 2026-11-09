import { describe, expect, it } from 'vitest';
import type { Word } from '../src/data/levels';
import { checkPaper, hanOnly, maxPaperChars, paperPool, pickPaperWord } from '../src/lib/paper';
import {
  activities,
  ANSWER_CAP_S,
  EARN,
  freshProgress,
  normalizeProgress,
  paperCoinsLeft,
  practiced,
  PROGRESS_VERSION,
  recordPaper,
  streak,
  todayLog,
  type Progress,
} from '../src/lib/progress';
import { reminderMessage } from '../src/lib/reminderMessage';
import { activityToday } from '../src/lib/rewards';
import type { StoredCard } from '../src/lib/srs';
import { activityTotals, dailyStats } from '../src/lib/stats';
import { mergeProgress } from '../src/lib/sync';

const NOW = new Date('2026-11-09T18:00:00');
const card = (): StoredCard => ({ due: '2026-11-20T00:00:00.000Z', stability: 5, difficulty: 5, elapsed_days: 1, scheduled_days: 5, learning_steps: 0, reps: 3, lapses: 0, state: 2, last_review: '2026-11-08T12:00:00.000Z' });
const word = (id: number, hanzi: string): Word => ({ id, hanzi, pinyin: 'x', pos: '名', es: 'algo', ex: { zh: hanzi, py: 'x', es: 'algo' } });

describe('escritura en papel: monedas y actividad', () => {
  it('una palabra escrita de memoria da monedas, suma tiempo y cuenta como actividad', () => {
    const p = recordPaper(freshProgress(), NOW, 95, true);
    const t = todayLog(p, NOW);
    expect([t.pa, t.c, t.t]).toEqual([1, EARN.paper, 95]);
    expect(p.rewards.coins).toBe(EARN.paper);
    expect(activityToday(p, NOW)).toBe(1);
    expect(practiced(p.log['2026-11-09'])).toBe(true);
    expect(ANSWER_CAP_S.paper).toBe(180);
  });

  it('si vio cómo se escribe, cuenta como práctica pero no da monedas', () => {
    const p = recordPaper(freshProgress(), NOW, 60, false);
    expect(todayLog(p, NOW).pa).toBe(1);
    expect(p.rewards.coins).toBe(0);
    expect(todayLog(p, NOW).c).toBe(0);
  });

  it('las monedas tienen tope diario; después sigue contando para la meta', () => {
    let p = freshProgress();
    for (let i = 0; i < EARN.paperCap; i++) p = recordPaper(p, NOW, 30, true);
    expect(p.rewards.coins).toBe(EARN.paper * EARN.paperCap);
    expect(paperCoinsLeft(p, NOW)).toBe(0);
    p = recordPaper(p, NOW, 30, true);
    expect(p.rewards.coins).toBe(EARN.paper * EARN.paperCap);
    expect(activityToday(p, NOW)).toBe(EARN.paperCap + 1);
    // Al otro día vuelve a dar monedas.
    const tomorrow = new Date('2026-11-10T09:00:00');
    expect(paperCoinsLeft(p, tomorrow)).toBe(EARN.paperCap);
    expect(recordPaper(p, tomorrow, 30, true).rewards.coins).toBe(EARN.paper * (EARN.paperCap + 1));
  });

  it('un día con solo papel cuenta para la racha, las estadísticas y el recordatorio', () => {
    const p: Progress = { ...freshProgress(), log: { '2026-11-08': { pa: 2 }, '2026-11-09': { r: 3, pa: 1 } } };
    expect(activities(p.log['2026-11-09'])).toBe(4);
    expect(streak(p, NOW)).toBe(2);
    expect(dailyStats(p, NOW, 2).map((d) => d.activities)).toEqual([2, 4]);
    expect(activityTotals(p, NOW, 7)).toEqual({ cards: 3, writing: 0, speaking: 0, paper: 3 });
    const onlyPaper: Progress = { ...freshProgress(), log: { '2026-11-09': { pa: 1 } } };
    expect(reminderMessage(onlyPaper, NOW).studiedToday).toBe(true);
  });
});

describe('escritura en papel: formato del progreso y sincronización', () => {
  it('el progreso de la versión 4 sirve tal cual en la 5', () => {
    const v4 = { ...freshProgress(), v: 4, decks: { read: { '1': card() }, write: {} }, log: { '2026-11-08': { r: 20, n: 5, c: 25, t: 600, rr: 10, rf: 1 } } };
    const p = normalizeProgress(JSON.parse(JSON.stringify(v4)));
    expect(PROGRESS_VERSION).toBe(5);
    expect(p.v).toBe(5);
    expect(p.log).toEqual(v4.log);
    expect(p.decks.read['1']).toEqual(v4.decks.read['1']);
    expect(todayLog(p, new Date('2026-11-08T10:00:00')).pa).toBe(0);
  });

  it('al sincronizar, suma las palabras en papel de cada dispositivo', () => {
    const base = { ...freshProgress(), log: { '2026-11-09': { r: 10, pa: 2, c: 14 } } };
    const local = { ...base, log: { '2026-11-09': { r: 10, pa: 5, c: 20 } } };
    const remote = { ...base, log: { '2026-11-09': { r: 12, pa: 3, c: 18 } } };
    expect(mergeProgress(base, local, remote).log['2026-11-09']).toEqual({ r: 12, pa: 6, c: 24 });
    // Sin base (la primera vez), lo mayor de cada lado.
    expect(mergeProgress(undefined, local, remote).log['2026-11-09']).toEqual({ r: 12, pa: 5, c: 20 });
  });
});

describe('escritura en papel: revisar la foto', () => {
  it('solo cuenta los caracteres chinos', () => {
    expect(hanOnly('喝 茶\n¡OK! 123，')).toBe('喝茶');
    expect(hanOnly('Hello')).toBe('');
  });

  it('acepta la palabra sola, repetida o con espacios', () => {
    expect(checkPaper('喝茶', '喝茶')).toEqual({ ok: true });
    expect(checkPaper('喝茶', '喝 茶\n喝茶\n喝茶')).toEqual({ ok: true });
    expect(checkPaper('水', '水水水水')).toEqual({ ok: true });
  });

  it('dice qué leyó cuando es otra palabra', () => {
    expect(checkPaper('喝茶', '喝荼')).toEqual({ ok: false, reason: 'otra', read: '喝荼' });
    expect(checkPaper('喝茶', '茶喝')).toEqual({ ok: false, reason: 'otra', read: '茶喝' });
  });

  it('una foto sin chino no cuenta', () => {
    expect(checkPaper('水', '')).toEqual({ ok: false, reason: 'vacia' });
    expect(checkPaper('水', 'agua 123')).toEqual({ ok: false, reason: 'vacia' });
  });

  it('una foto con mucho texto (una página, una pantalla) no cuenta aunque tenga la palabra', () => {
    expect(maxPaperChars('水')).toBe(8);
    expect(maxPaperChars('一路平安')).toBe(12);
    expect(checkPaper('水', '我们喝水吧。今天天气很好')).toEqual({ ok: false, reason: 'mucho', read: '我们喝水吧今天天气很好' });
    expect(checkPaper('水', '我喝水').ok).toBe(true);
  });
});

describe('escritura en papel: qué palabra pide', () => {
  const words = [word(1, '一'), word(2, '二'), word(3, '三'), word(4, '四'), word(5, '五'), word(6, '六'), word(7, '七')];

  it('usa las palabras de Escribir; si son pocas, las que ya viste en Repasar', () => {
    const read = Object.fromEntries(words.map((w) => [String(w.id), card()]));
    const fewWritten: Progress = { ...freshProgress(), decks: { read, write: { '1': card(), '2': card() } } };
    expect(paperPool(fewWritten, words).map((w) => w.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const write = Object.fromEntries(words.slice(0, 5).map((w) => [String(w.id), card()]));
    const manyWritten: Progress = { ...freshProgress(), decks: { read, write } };
    expect(paperPool(manyWritten, words).map((w) => w.id)).toEqual([1, 2, 3, 4, 5]);
    expect(paperPool(freshProgress(), words)).toEqual([]);
  });

  it('no repite las últimas que salieron, si hay de dónde escoger', () => {
    expect(pickPaperWord(words, [1, 2, 3, 4, 5, 6], () => 0.5)?.id).toBe(7);
    expect(pickPaperWord(words, [], () => 0)?.id).toBe(1);
    expect(pickPaperWord(words, [], () => 0.9999)?.id).toBe(7);
    // Si ya salieron todas, escoge entre todas.
    expect(pickPaperWord(words.slice(0, 2), [1, 2], () => 0)?.id).toBe(1);
    expect(pickPaperWord([], [], () => 0)).toBeNull();
  });
});
