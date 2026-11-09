// Repaso espaciado con FSRS (el algoritmo moderno de Anki), a través de ts-fsrs.
import { createEmptyCard, fsrs, Rating, State, type Card, type Grade } from 'ts-fsrs';

export { Rating, State };
export type { Grade };

/** Tarjeta tal como se guarda en el almacenamiento (fechas como texto ISO). */
export type StoredCard = {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: State;
  last_review?: string;
};

export const GRADES: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];

export const GRADE_LABEL: Record<Grade, string> = {
  [Rating.Again]: 'Otra vez',
  [Rating.Hard]: 'Difícil',
  [Rating.Good]: 'Bien',
  [Rating.Easy]: 'Fácil',
};

const scheduler = fsrs({
  request_retention: 0.9,
  maximum_interval: 365,
  enable_fuzz: true,
  learning_steps: ['1m', '10m'],
  relearning_steps: ['10m'],
});

export function toCard(stored: StoredCard | undefined, now: Date): Card {
  if (!stored) return createEmptyCard(now);
  return {
    ...stored,
    due: new Date(stored.due),
    last_review: stored.last_review ? new Date(stored.last_review) : undefined,
  };
}

export function toStored(card: Card): StoredCard {
  const out: StoredCard = {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
  };
  if (card.last_review) out.last_review = card.last_review.toISOString();
  return out;
}

/**
 * Calcula de una vez el resultado de las cuatro respuestas posibles.
 * La pantalla muestra estos intervalos y, al responder, guarda exactamente el resultado elegido,
 * así lo que se ve en el botón coincide con lo que se programa.
 */
export function previewAll(stored: StoredCard | undefined, now: Date): Record<Grade, StoredCard> {
  const rec = scheduler.repeat(toCard(stored, now), now);
  return {
    [Rating.Again]: toStored(rec[Rating.Again].card),
    [Rating.Hard]: toStored(rec[Rating.Hard].card),
    [Rating.Good]: toStored(rec[Rating.Good].card),
    [Rating.Easy]: toStored(rec[Rating.Easy].card),
  } as Record<Grade, StoredCard>;
}

export function isLearning(c: StoredCard): boolean {
  return c.state === State.Learning || c.state === State.Relearning;
}

/** Dominada: en repaso y con un intervalo de 21 días o más (la misma convención que Anki). */
export function isMature(c: StoredCard): boolean {
  return c.state === State.Review && c.scheduled_days >= 21;
}

/** Probabilidad (de 0 a 1) de recordar esta tarjeta en este momento, según FSRS. */
export function recallChance(stored: StoredCard, now: Date): number {
  return scheduler.get_retrievability(toCard(stored, now), now, false);
}
