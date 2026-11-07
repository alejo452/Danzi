// Qué tarjeta toca ahora y cuántas quedan para hoy, para cualquier mazo (lectura o escritura).
import { endOfToday, MINUTE } from './dates';
import { isLearning, State, type StoredCard } from './srs';

export type Deck = Record<string, StoredCard>;

export type QueueCounts = { newLeft: number; learn: number; review: number; total: number };

/** Si no queda nada más, las tarjetas en aprendizaje que vuelven en menos de 20 minutos se adelantan. */
const LEARN_AHEAD_MS = 20 * MINUTE;

export function queueCounts(deck: Deck, newCandidates: string[], newLeftToday: number, now: Date): QueueCounts {
  const end = endOfToday(now).getTime();
  let learn = 0;
  let review = 0;
  for (const c of Object.values(deck)) {
    const due = Date.parse(c.due);
    if (isLearning(c) && due < end) learn++;
    else if (c.state === State.Review && due < end) review++;
  }
  const newLeft = Math.max(0, Math.min(newLeftToday, newCandidates.length));
  return { newLeft, learn, review, total: newLeft + learn + review };
}

/**
 * Orden: primero las que están en aprendizaje y ya vencieron, luego los repasos del día,
 * luego las nuevas (si queda cupo) y al final las de aprendizaje que vuelven pronto.
 */
export function nextCard(deck: Deck, newCandidates: string[], newLeftToday: number, now: Date): string | null {
  const t = now.getTime();
  const end = endOfToday(now).getTime();
  const learnDue: [number, string][] = [];
  const reviewDue: [number, string][] = [];
  const ahead: [number, string][] = [];
  for (const [id, c] of Object.entries(deck)) {
    const due = Date.parse(c.due);
    if (isLearning(c)) {
      if (due <= t) learnDue.push([due, id]);
      else if (due <= t + LEARN_AHEAD_MS) ahead.push([due, id]);
    } else if (c.state === State.Review && due < end) {
      reviewDue.push([due, id]);
    }
  }
  const byDue = (a: [number, string], b: [number, string]) => a[0] - b[0];
  if (learnDue.length) return learnDue.sort(byDue)[0][1];
  if (reviewDue.length) return reviewDue.sort(byDue)[0][1];
  if (newLeftToday > 0 && newCandidates.length) return newCandidates[0];
  if (ahead.length) return ahead.sort(byDue)[0][1];
  return null;
}

/** Cuántas tarjetas vencen cada uno de los próximos `days` días (el día 0 incluye las atrasadas). */
export function forecast(decks: Deck[], days: number, now: Date): number[] {
  const out = new Array(days).fill(0);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  for (const deck of decks) {
    for (const c of Object.values(deck)) {
      const due = Date.parse(c.due);
      const end0 = endOfToday(now).getTime();
      if (due < end0) {
        out[0]++;
        continue;
      }
      for (let i = 1; i < days; i++) {
        const dayEnd = new Date(start);
        dayEnd.setDate(dayEnd.getDate() + i + 1);
        if (due < dayEnd.getTime()) {
          out[i]++;
          break;
        }
      }
    }
  }
  return out;
}

/** Texto sobre cuándo vuelve la próxima tarjeta, para la pantalla de "Listo por hoy". */
export function nextDueText(deck: Deck, now: Date): string {
  let next = Infinity;
  for (const c of Object.values(deck)) {
    const due = Date.parse(c.due);
    if (due > now.getTime()) next = Math.min(next, due);
  }
  if (next === Infinity) return '';
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const nextDay = new Date(next);
  nextDay.setHours(0, 0, 0, 0);
  const diff = Math.round((nextDay.getTime() - today.getTime()) / 86_400_000);
  if (diff <= 0) return 'La próxima vuelve más tarde hoy.';
  if (diff === 1) return 'Las próximas vuelven mañana.';
  return `Las próximas vuelven en ${diff} días.`;
}
