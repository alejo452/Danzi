// Modelo del progreso del usuario. Funciones puras: no tocan el almacenamiento ni React.
// REGLA: el progreso es del usuario. Cualquier cambio de formato sube PROGRESS_VERSION y agrega
// una migración en normalizeProgress que conserve los datos existentes.
import { addDays, dayKey } from './dates';
import type { Deck } from './queue';
import type { StoredCard } from './srs';

export const PROGRESS_VERSION = 1;

export type DeckKind = 'read' | 'write';

export type Settings = {
  /** Niveles activos, en orden. Las palabras nuevas salen de estos niveles. */
  levels: string[];
  newPerDay: number;
  newWritePerDay: number;
  autoSpeak: boolean;
  pinyinFront: boolean;
};

/** Actividad de un día: r = tarjetas, n = palabras nuevas, w = escritura, wn = caracteres nuevos, h = habla. */
export type DayLog = { r?: number; n?: number; w?: number; wn?: number; h?: number };

export type Progress = {
  v: number;
  decks: Record<DeckKind, Deck>;
  settings: Settings;
  log: Record<string, DayLog>;
  /** Cupo extra de palabras nuevas que el usuario pidió para un día concreto. */
  extra: { date: string; read: number; write: number };
  updatedAt: number;
};

export function freshProgress(): Progress {
  return {
    v: PROGRESS_VERSION,
    decks: { read: {}, write: {} },
    settings: { levels: ['1'], newPerDay: 10, newWritePerDay: 5, autoSpeak: false, pinyinFront: false },
    log: {},
    extra: { date: '', read: 0, write: 0 },
    updatedAt: 0,
  };
}

function isObject(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}

/** Acepta datos guardados o importados y devuelve un progreso válido, sin perder lo que se pueda conservar. */
export function normalizeProgress(raw: unknown): Progress {
  const f = freshProgress();
  if (!isObject(raw)) return f;
  const decks = isObject(raw.decks) ? raw.decks : {};
  const settings = isObject(raw.settings) ? raw.settings : {};
  const extra = isObject(raw.extra) ? raw.extra : {};
  return {
    v: PROGRESS_VERSION,
    decks: {
      read: isObject(decks.read) ? (decks.read as Deck) : {},
      write: isObject(decks.write) ? (decks.write as Deck) : {},
    },
    settings: {
      ...f.settings,
      ...settings,
      levels: Array.isArray(settings.levels) && settings.levels.length ? (settings.levels as string[]) : f.settings.levels,
    } as Settings,
    log: isObject(raw.log) ? (raw.log as Record<string, DayLog>) : {},
    extra: { date: String(extra.date ?? ''), read: Number(extra.read) || 0, write: Number(extra.write) || 0 },
    updatedAt: Number(raw.updatedAt) || 0,
  };
}

export function todayLog(p: Progress, now: Date): Required<DayLog> {
  const l = p.log[dayKey(now)] ?? {};
  return { r: l.r ?? 0, n: l.n ?? 0, w: l.w ?? 0, wn: l.wn ?? 0, h: l.h ?? 0 };
}

/** Cuántas palabras nuevas se pueden introducir todavía hoy en ese mazo. */
export function newLeftToday(p: Progress, kind: DeckKind, now: Date): number {
  const t = todayLog(p, now);
  const extra = p.extra.date === dayKey(now) ? p.extra[kind] : 0;
  return kind === 'read' ? p.settings.newPerDay + extra - t.n : p.settings.newWritePerDay + extra - t.wn;
}

/** Guarda el resultado de una respuesta y suma la actividad del día. Devuelve un progreso nuevo. */
export function recordAnswer(p: Progress, kind: DeckKind, id: string, card: StoredCard, now: Date): Progress {
  const key = dayKey(now);
  const wasNew = !p.decks[kind][id];
  const l = { ...(p.log[key] ?? {}) };
  if (kind === 'read') {
    l.r = (l.r ?? 0) + 1;
    if (wasNew) l.n = (l.n ?? 0) + 1;
  } else {
    l.w = (l.w ?? 0) + 1;
    if (wasNew) l.wn = (l.wn ?? 0) + 1;
  }
  return {
    ...p,
    decks: { ...p.decks, [kind]: { ...p.decks[kind], [id]: card } },
    log: { ...p.log, [key]: l },
    updatedAt: now.getTime(),
  };
}

export function recordSpeaking(p: Progress, now: Date): Progress {
  const key = dayKey(now);
  const l = { ...(p.log[key] ?? {}) };
  l.h = (l.h ?? 0) + 1;
  return { ...p, log: { ...p.log, [key]: l }, updatedAt: now.getTime() };
}

export function addExtraNew(p: Progress, kind: DeckKind, n: number, now: Date): Progress {
  const key = dayKey(now);
  const base = p.extra.date === key ? p.extra : { date: key, read: 0, write: 0 };
  return { ...p, extra: { ...base, [kind]: base[kind] + n }, updatedAt: now.getTime() };
}

/** Días seguidos con actividad. Si hoy todavía no hay actividad, cuenta desde ayer. */
export function streak(p: Progress, now: Date): number {
  const active = (l?: DayLog) => !!l && (l.r ?? 0) + (l.w ?? 0) + (l.h ?? 0) > 0;
  let i = active(p.log[dayKey(now)]) ? 0 : 1;
  let n = 0;
  while (active(p.log[dayKey(addDays(now, -i))])) {
    n++;
    i++;
  }
  return n;
}
