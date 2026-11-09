import { describe, expect, it } from 'vitest';
import { ANSWER_CAP_S, answerSeconds, freshProgress, normalizeProgress, PROGRESS_VERSION, recordAnswer, recordSpeaking, todayLog, type Progress } from '../src/lib/progress';
import { previewAll, Rating, type StoredCard } from '../src/lib/srs';
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
    expect(PROGRESS_VERSION).toBe(4);
    expect(p.v).toBe(4);
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
