// Estadísticas: tiempo de estudio, actividad de cada día y cuánto recuerdas. Funciones puras sobre el progreso.
// El tiempo y los repasos recordados u olvidados se guardan desde la versión 4 del progreso (DayLog: t, rr, rf, wr,
// wf); la actividad (tarjetas, escritura y habla) viene de antes.
import { addDays, dayKey, fromDayKey } from './dates';
import type { DeckKind, Progress } from './progress';
import { recallChance } from './srs';

/** Estado «en repaso» de una tarjeta FSRS (State.Review de ts-fsrs). */
const REVIEW_STATE = 2;

/** Con menos repasos que estos, el porcentaje engaña (1 de 1 es 100 %): se muestra solo la cuenta. */
export const MIN_REVIEWS = 10;

/** Lo que FSRS busca: que recuerdes el 90 % de lo que repasas (request_retention en src/lib/srs.ts). */
export const TARGET_RETENTION = 0.9;

export type DayStat = {
  key: string;
  date: Date;
  /** Segundos de estudio (desde la versión 4). */
  seconds: number;
  /** Tarjetas, palabras escritas y ejercicios de habla. */
  activities: number;
};

/** Los últimos `days` días, del más viejo a hoy, con su tiempo de estudio y su actividad. */
export function dailyStats(p: Progress, now: Date, days: number): DayStat[] {
  const out: DayStat[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(now, -i);
    const key = dayKey(date);
    const l = p.log[key] ?? {};
    out.push({ key, date: fromDayKey(key), seconds: l.t ?? 0, activities: (l.r ?? 0) + (l.w ?? 0) + (l.h ?? 0) });
  }
  return out;
}

/** Segundos de estudio en los últimos `days` días, contando hoy. */
export function studySeconds(p: Progress, now: Date, days: number): number {
  return dailyStats(p, now, days).reduce((sum, d) => sum + d.seconds, 0);
}

/** Desde qué día se mide el tiempo (el primero con tiempo guardado), o null si todavía no hay. */
export function firstTimedDay(p: Progress): string | null {
  const days = Object.keys(p.log).filter((k) => (p.log[k].t ?? 0) > 0).sort();
  return days[0] ?? null;
}

/** Tarjetas, palabras escritas y ejercicios de habla de los últimos `days` días, contando hoy. */
export function activityTotals(p: Progress, now: Date, days: number): { cards: number; writing: number; speaking: number } {
  const out = { cards: 0, writing: 0, speaking: 0 };
  for (const d of dailyStats(p, now, days)) {
    const l = p.log[d.key] ?? {};
    out.cards += l.r ?? 0;
    out.writing += l.w ?? 0;
    out.speaking += l.h ?? 0;
  }
  return out;
}

export type Retention = {
  /** Respuestas a palabras que ya estaban en repaso. */
  reviews: number;
  /** De esas, las olvidadas («Otra vez»). */
  forgot: number;
  /** Porcentaje recordado (0 a 1), o null si todavía hay menos de MIN_REVIEWS repasos. */
  rate: number | null;
};

/**
 * Retención real de los últimos `days` días: de las palabras que ya estaban en repaso, cuántas recordaste. Es la
 * misma «retención verdadera» de Anki. Las palabras nuevas y las que se están aprendiendo no cuentan.
 */
export function retention(p: Progress, now: Date, days: number, kind: DeckKind): Retention {
  let reviews = 0;
  let forgot = 0;
  for (const d of dailyStats(p, now, days)) {
    const l = p.log[d.key] ?? {};
    reviews += (kind === 'read' ? l.rr : l.wr) ?? 0;
    forgot += (kind === 'read' ? l.rf : l.wf) ?? 0;
  }
  return { reviews, forgot, rate: reviews >= MIN_REVIEWS ? (reviews - forgot) / reviews : null };
}

/**
 * Cuánto recordarías ahora mismo, según FSRS: el promedio de la probabilidad de recordar cada palabra que está en
 * repaso. Sale de las tarjetas, así que existe desde el primer día. `rate` es null si no hay palabras en repaso.
 */
export function estimatedRecall(p: Progress, now: Date, kind: DeckKind): { words: number; rate: number | null } {
  let words = 0;
  let sum = 0;
  for (const card of Object.values(p.decks[kind])) {
    if (card.state !== REVIEW_STATE) continue;
    const r = recallChance(card, now);
    if (!Number.isFinite(r)) continue;
    words++;
    sum += r;
  }
  return { words, rate: words ? sum / words : null };
}

/** Espacio que no se corta: el número y su unidad quedan en la misma línea. */
const NB = '\u00a0';

/** «Menos de 1 min», «12 min», «1 h 25 min» o «2 h». */
export function durationLabel(seconds: number): string {
  if (seconds <= 0) return `0${NB}min`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return `menos de 1${NB}min`;
  if (minutes < 60) return `${minutes}${NB}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}${NB}h ${m}${NB}min` : `${h}${NB}h`;
}

/** Un porcentaje redondeado, como se escribe en Colombia: «91 %». */
export function percentLabel(rate: number): string {
  return `${Math.round(rate * 100)}${NB}%`;
}
