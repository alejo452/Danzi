import { describe, expect, it } from 'vitest';
import { ANSWER_CAP_S, answerSeconds, freshProgress, normalizeProgress, PROGRESS_VERSION, recordAnswer, recordSpeaking, todayLog, type Progress } from '../src/lib/progress';
import { previewAll, Rating, type StoredCard } from '../src/lib/srs';
import { activityTotals, dailyStats, durationLabel, estimatedRecall, firstTimedDay, MIN_REVIEWS, percentLabel, retention, studySeconds } from '../src/lib/stats';
import { mergeProgress } from '../src/lib/sync';

const NOW = new Date('2026-11-09T15:00:00');

/** Una tarjeta ya en repaso (estado 2), con su próximo repaso hoy. */
const inReview = (lapses = 0): StoredCard => ({
  due: '2026-11-09T12:00:00.000Z',
  stability: 12,
  difficulty: 5,
  elapsed_days: 10,
  scheduled_days: 10,
  learning_steps: 0,
  reps: 4,
  lapses,
  state: 2,
  last_review: '2026-10-30T12:00:00.000Z',
});

describe('lo que se mide para las estadísticas', () => {
  it('el tiempo de cada respuesta tiene tope', () => {
    expect(answerSeconds(0, 12_400, ANSWER_CAP_S.read)).toBe(12);
    expect(answerSeconds(0, 600_000, ANSWER_CAP_S.read)).toBe(60);
    expect(answerSeconds(0, 600_000, ANSWER_CAP_S.write)).toBe(120);
    expect(answerSeconds(5_000, 1_000, ANSWER_CAP_S.speak)).toBe(0);
  });

  it('suma el tiempo de tarjetas, escritura y habla', () => {
    let p = freshProgress();
    p = recordAnswer(p, 'read', '1', previewAll(undefined, NOW)[Rating.Good], NOW, 8);
    p = recordAnswer(p, 'write', '1', previewAll(undefined, NOW)[Rating.Good], NOW, 40);
    p = recordSpeaking(p, NOW, 15);
    expect(todayLog(p, NOW).t).toBe(63);
  });

  it('cuenta las tarjetas en repaso que recordaste y las que olvidaste', () => {
    let p: Progress = { ...freshProgress(), decks: { read: { a: inReview(), b: inReview(), n: inReview() }, write: { a: inReview() } } };
    // Una palabra nueva no cuenta para la retención.
    p = recordAnswer(p, 'read', 'nueva', previewAll(undefined, NOW)[Rating.Good], NOW);
    p = recordAnswer(p, 'read', 'a', previewAll(p.decks.read.a, NOW)[Rating.Good], NOW);
    p = recordAnswer(p, 'read', 'b', previewAll(p.decks.read.b, NOW)[Rating.Hard], NOW);
    p = recordAnswer(p, 'read', 'n', previewAll(p.decks.read.n, NOW)[Rating.Again], NOW);
    // Ya olvidada: ahora está aprendiendo de nuevo, así que la siguiente respuesta no cuenta.
    p = recordAnswer(p, 'read', 'n', previewAll(p.decks.read.n, NOW)[Rating.Good], NOW);
    p = recordAnswer(p, 'write', 'a', previewAll(p.decks.write.a, NOW)[Rating.Again], NOW);
    const t = todayLog(p, NOW);
    expect([t.r, t.rr, t.rf, t.w, t.wr, t.wf]).toEqual([5, 3, 1, 1, 1, 1]);
  });

  it('el progreso de la versión anterior sirve tal cual', () => {
    const v3 = { ...freshProgress(), v: 3, log: { '2026-11-08': { r: 20, n: 5, c: 25 } } };
    const p = normalizeProgress(JSON.parse(JSON.stringify(v3)));
    expect(PROGRESS_VERSION).toBe(5);
    expect(p.v).toBe(5);
    expect(p.log).toEqual({ '2026-11-08': { r: 20, n: 5, c: 25 } });
    expect(todayLog(p, new Date('2026-11-08T10:00:00')).t).toBe(0);
  });

  it('al sincronizar, suma el tiempo y los repasos de cada dispositivo', () => {
    const base = { ...freshProgress(), log: { '2026-11-09': { r: 10, t: 300, rr: 8, rf: 1 } } };
    const local = { ...base, log: { '2026-11-09': { r: 14, t: 420, rr: 12, rf: 2 } } };
    const remote = { ...base, log: { '2026-11-09': { r: 12, t: 360, rr: 9, rf: 1, w: 3 } } };
    expect(mergeProgress(base, local, remote).log['2026-11-09']).toEqual({ r: 16, t: 480, rr: 13, rf: 2, w: 3 });
  });
});

describe('cálculos de las estadísticas', () => {
  const p: Progress = {
    ...freshProgress(),
    log: {
      '2026-11-09': { r: 20, w: 5, h: 3, t: 900, rr: 12, rf: 1, wr: 4, wf: 1 },
      '2026-11-08': { r: 10, t: 300, rr: 6, rf: 2 },
      '2026-11-03': { r: 4, h: 2, t: 120, rr: 3 },
      // Antes de la versión 4 no había tiempo ni retención.
      '2026-10-01': { r: 30, w: 10 },
    },
  };

  it('arma los días, del más viejo a hoy, con tiempo y actividad', () => {
    const days = dailyStats(p, NOW, 7);
    expect(days.map((d) => d.key)).toEqual(['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09']);
    expect(days.map((d) => d.seconds)).toEqual([120, 0, 0, 0, 0, 300, 900]);
    expect(days.map((d) => d.activities)).toEqual([6, 0, 0, 0, 0, 10, 28]);
    expect(days[6].date.getDate()).toBe(9);
  });

  it('suma el tiempo de los últimos días y sabe desde cuándo se mide', () => {
    expect(studySeconds(p, NOW, 1)).toBe(900);
    expect(studySeconds(p, NOW, 7)).toBe(1320);
    expect(studySeconds(p, NOW, 2)).toBe(1200);
    expect(firstTimedDay(p)).toBe('2026-11-03');
    expect(firstTimedDay(freshProgress())).toBeNull();
  });

  it('cuenta la actividad de los últimos 30 días', () => {
    expect(activityTotals(p, NOW, 30)).toEqual({ cards: 34, writing: 5, speaking: 5, paper: 0 });
    expect(activityTotals(p, NOW, 60)).toEqual({ cards: 64, writing: 15, speaking: 5, paper: 0 });
  });

  it('calcula la retención real solo con suficientes repasos', () => {
    expect(retention(p, NOW, 30, 'read')).toEqual({ reviews: 21, forgot: 3, rate: 18 / 21 });
    expect(retention(p, NOW, 30, 'write')).toEqual({ reviews: 4, forgot: 1, rate: null });
    expect(MIN_REVIEWS).toBe(10);
    expect(retention(p, NOW, 1, 'read').rate).toBeCloseTo(11 / 12);
  });

  it('estima cuánto recordarías hoy con FSRS', () => {
    const fresh: Progress = { ...freshProgress(), decks: { read: { a: inReview(), b: inReview(), nueva: previewAll(undefined, NOW)[Rating.Good] }, write: {} } };
    const r = estimatedRecall(fresh, NOW, 'read');
    expect(r.words).toBe(2);
    // Repasadas hace 10 días, con estabilidad 12: FSRS da algo menos del 90 %.
    expect(r.rate!).toBeGreaterThan(0.85);
    expect(r.rate!).toBeLessThan(0.95);
    expect(estimatedRecall(fresh, NOW, 'write')).toEqual({ words: 0, rate: null });
  });

  it('escribe duraciones y porcentajes, sin separar el número de su unidad', () => {
    const plain = (s: string) => s.replace(/\u00a0/g, ' ');
    expect(plain(durationLabel(0))).toBe('0 min');
    expect(plain(durationLabel(20))).toBe('menos de 1 min');
    expect(plain(durationLabel(12 * 60 + 10))).toBe('12 min');
    expect(plain(durationLabel(85 * 60))).toBe('1 h 25 min');
    expect(plain(durationLabel(120 * 60))).toBe('2 h');
    expect(durationLabel(85 * 60)).toBe('1\u00a0h 25\u00a0min');
    expect(percentLabel(18 / 21)).toBe('86\u00a0%');
  });
});
