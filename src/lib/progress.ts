// Modelo del progreso del usuario. Funciones puras: no tocan el almacenamiento ni React.
// REGLA: el progreso es del usuario. Cualquier cambio de formato sube PROGRESS_VERSION y agrega
// una migración en normalizeProgress que conserve los datos existentes.
//
// Versiones:
// 1. Mazos, ajustes, actividad diaria y cupo extra.
// 2. Recompensas (monedas, sobres rojos, sellos, protectores de racha y temas) y meta diaria.
// 3. Atuendos comprados y atuendo activo de Xi Bao.
// 4. Tiempo de estudio y repasos recordados u olvidados de cada día (para las estadísticas).
// 5. Palabras escritas a mano en papel de cada día (ejercicio con la cámara de la APK).
import { addDays, dayKey } from './dates';
import { DEFAULT_OUTFIT, isOutfitId } from './outfits';
import type { Deck } from './queue';
import type { StoredCard } from './srs';

export const PROGRESS_VERSION = 5;

export type DeckKind = 'read' | 'write';

export type Settings = {
  /** Niveles activos, en orden. Las palabras nuevas salen de estos niveles. */
  levels: string[];
  newPerDay: number;
  newWritePerDay: number;
  autoSpeak: boolean;
  pinyinFront: boolean;
  /** Actividades del día (tarjetas, palabras escritas, ejercicios de habla y palabras en papel) para abrir el sobre rojo. */
  dailyGoal: number;
};

/**
 * Actividad de un día: r = tarjetas, n = palabras nuevas, w = escritura, wn = caracteres nuevos,
 * h = habla, c = monedas ganadas.
 * Desde la versión 4, para las estadísticas: t = segundos de estudio; rr = respuestas a tarjetas que ya estaban en
 * repaso y rf = de esas, las olvidadas («Otra vez»); wr y wf, lo mismo en escritura.
 * Desde la versión 5: pa = palabras escritas a mano en papel que Danzi leyó bien en la foto.
 */
export type DayLog = {
  r?: number;
  n?: number;
  w?: number;
  wn?: number;
  h?: number;
  c?: number;
  t?: number;
  rr?: number;
  rf?: number;
  wr?: number;
  wf?: number;
  pa?: number;
};

export type Rewards = {
  /** Saldo de monedas. */
  coins: number;
  /** Sobres rojos abiertos: día (AAAA-MM-DD) → monedas que traía. */
  envelopes: Record<string, number>;
  /** Sellos recogidos: id → día en que se recogió. */
  seals: Record<string, string>;
  /** Protectores de racha guardados (de 0 a MAX_SHIELDS). */
  shields: number;
  /** Días sin práctica que salvó un protector. */
  shielded: string[];
  /** Tema de color activo y temas comprados. */
  theme: string;
  themes: string[];
  /** Atuendo activo de Xi Bao y atuendos comprados. */
  outfit: string;
  outfits: string[];
};

export type Progress = {
  v: number;
  decks: Record<DeckKind, Deck>;
  settings: Settings;
  log: Record<string, DayLog>;
  /** Cupo extra de palabras nuevas que el usuario pidió para un día concreto. */
  extra: { date: string; read: number; write: number };
  rewards: Rewards;
  updatedAt: number;
};

export const DEFAULT_THEME = 'laca';
export const MAX_SHIELDS = 2;

/** Monedas por practicar. Los topes diarios evitan que se acumulen repitiendo tarjetas sin fin. */
export const EARN = {
  card: 1,
  cardCap: 50,
  newWord: 2,
  write: 1,
  writeCap: 30,
  newWrite: 2,
  speak: 1,
  speakCap: 20,
  /** Escribir en papel cuesta más que una tarjeta. El tope evita sacar monedas con fotos de textos de internet. */
  paper: 2,
  paperCap: 10,
} as const;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function freshRewards(): Rewards {
  return { coins: 0, envelopes: {}, seals: {}, shields: 0, shielded: [], theme: DEFAULT_THEME, themes: [DEFAULT_THEME], outfit: DEFAULT_OUTFIT, outfits: [DEFAULT_OUTFIT] };
}

export function freshProgress(): Progress {
  return {
    v: PROGRESS_VERSION,
    decks: { read: {}, write: {} },
    settings: { levels: ['1'], newPerDay: 10, newWritePerDay: 5, autoSpeak: false, pinyinFront: false, dailyGoal: 20 },
    log: {},
    extra: { date: '', read: 0, write: 0 },
    rewards: freshRewards(),
    updatedAt: 0,
  };
}

function isObject(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}

/** Entero mayor o igual a cero; cualquier otra cosa vale 0. */
function count(x: unknown): number {
  const n = Math.floor(Number(x));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function normalizeRewards(raw: unknown): Rewards {
  const f = freshRewards();
  if (!isObject(raw)) return f;
  const envelopes: Record<string, number> = {};
  if (isObject(raw.envelopes)) for (const [day, n] of Object.entries(raw.envelopes)) if (DAY_RE.test(day)) envelopes[day] = count(n);
  const seals: Record<string, string> = {};
  if (isObject(raw.seals)) for (const [id, day] of Object.entries(raw.seals)) if (typeof day === 'string') seals[id] = day;
  const shielded = Array.isArray(raw.shielded) ? raw.shielded.filter((d): d is string => typeof d === 'string' && DAY_RE.test(d)) : [];
  const themes = Array.isArray(raw.themes)
    ? [...new Set([DEFAULT_THEME, ...raw.themes.filter((t): t is string => typeof t === 'string')])]
    : f.themes;
  const theme = typeof raw.theme === 'string' && themes.includes(raw.theme) ? raw.theme : DEFAULT_THEME;
  // Versiones 1 y 2 no tenían vestidor. Se conserva todo y Xi Bao empieza con su atuendo clásico.
  const outfits = Array.isArray(raw.outfits)
    ? [...new Set([DEFAULT_OUTFIT, ...raw.outfits.filter(isOutfitId)])]
    : f.outfits;
  const outfit = isOutfitId(raw.outfit) && outfits.includes(raw.outfit) ? raw.outfit : DEFAULT_OUTFIT;
  return { coins: count(raw.coins), envelopes, seals, shields: Math.min(MAX_SHIELDS, count(raw.shields)), shielded, theme, themes, outfit, outfits };
}

/** Acepta datos guardados o importados (de cualquier versión) y devuelve un progreso válido, sin perder lo que se pueda conservar. */
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
      // Versión 1 no tenía meta diaria.
      dailyGoal: count(settings.dailyGoal) || f.settings.dailyGoal,
    } as Settings,
    // Las versiones 4 y 5 solo agregan contadores opcionales a cada día (tiempo, repasos recordados y palabras en
    // papel): los días de antes sirven tal cual.
    log: isObject(raw.log) ? (raw.log as Record<string, DayLog>) : {},
    extra: { date: String(extra.date ?? ''), read: Number(extra.read) || 0, write: Number(extra.write) || 0 },
    // Versión 1 no tenía recompensas: se empieza en cero y los sellos ya ganados quedan por recoger.
    rewards: normalizeRewards(raw.rewards),
    updatedAt: Number(raw.updatedAt) || 0,
  };
}

export function todayLog(p: Progress, now: Date): Required<DayLog> {
  const l = p.log[dayKey(now)] ?? {};
  return {
    r: l.r ?? 0,
    n: l.n ?? 0,
    w: l.w ?? 0,
    wn: l.wn ?? 0,
    h: l.h ?? 0,
    c: l.c ?? 0,
    t: l.t ?? 0,
    rr: l.rr ?? 0,
    rf: l.rf ?? 0,
    wr: l.wr ?? 0,
    wf: l.wf ?? 0,
    pa: l.pa ?? 0,
  };
}

/**
 * Tope de segundos que cuenta una respuesta, como en Anki: desde que aparece la tarjeta, la palabra o el ejercicio
 * hasta que se responde. Si alguien se va a mitad, no se suma todo ese rato. La escritura, con varios caracteres
 * por palabra, tiene más margen, y la de papel (escribir y tomar la foto) más todavía.
 */
export const ANSWER_CAP_S = { read: 60, write: 120, speak: 60, paper: 180 } as const;

/** Segundos que se cuentan para una respuesta: desde que apareció (ms) hasta ahora (ms), sin pasar del tope. */
export function answerSeconds(startedAt: number, now: number, cap: number): number {
  return Math.round(Math.min(cap, Math.max(0, (now - startedAt) / 1000)));
}

/** Estado «en repaso» de una tarjeta FSRS (State.Review de ts-fsrs). */
const REVIEW_STATE = 2;

/** Cuántas palabras nuevas se pueden introducir todavía hoy en ese mazo. */
export function newLeftToday(p: Progress, kind: DeckKind, now: Date): number {
  const t = todayLog(p, now);
  const extra = p.extra.date === dayKey(now) ? p.extra[kind] : 0;
  return kind === 'read' ? p.settings.newPerDay + extra - t.n : p.settings.newWritePerDay + extra - t.wn;
}

/** Suma monedas al saldo y a las ganadas de hoy. */
export function addCoins(p: Progress, n: number, now: Date): Progress {
  if (n <= 0) return p;
  const key = dayKey(now);
  const l = { ...(p.log[key] ?? {}) };
  l.c = (l.c ?? 0) + n;
  return { ...p, log: { ...p.log, [key]: l }, rewards: { ...p.rewards, coins: p.rewards.coins + n }, updatedAt: now.getTime() };
}

/**
 * Guarda el resultado de una respuesta, suma la actividad del día y las monedas ganadas. Devuelve un progreso nuevo.
 * `seconds`: lo que tardó la respuesta (answerSeconds), para el tiempo de estudio.
 */
export function recordAnswer(p: Progress, kind: DeckKind, id: string, card: StoredCard, now: Date, seconds = 0): Progress {
  const key = dayKey(now);
  const before = p.decks[kind][id];
  const wasNew = !before;
  const l = { ...(p.log[key] ?? {}) };
  // Para la retención solo cuentan las tarjetas que ya estaban en repaso. Responder «Otra vez» suma un olvido
  // (lapses), así se sabe sin conocer el botón.
  if (before?.state === REVIEW_STATE) {
    const forgot = (card.lapses ?? 0) > (before.lapses ?? 0);
    if (kind === 'read') {
      l.rr = (l.rr ?? 0) + 1;
      if (forgot) l.rf = (l.rf ?? 0) + 1;
    } else {
      l.wr = (l.wr ?? 0) + 1;
      if (forgot) l.wf = (l.wf ?? 0) + 1;
    }
  }
  if (seconds > 0) l.t = (l.t ?? 0) + Math.round(seconds);
  let coins = 0;
  if (kind === 'read') {
    l.r = (l.r ?? 0) + 1;
    if (l.r <= EARN.cardCap) coins += EARN.card;
    if (wasNew) {
      l.n = (l.n ?? 0) + 1;
      coins += EARN.newWord;
    }
  } else {
    l.w = (l.w ?? 0) + 1;
    if (l.w <= EARN.writeCap) coins += EARN.write;
    if (wasNew) {
      l.wn = (l.wn ?? 0) + 1;
      coins += EARN.newWrite;
    }
  }
  l.c = (l.c ?? 0) + coins;
  return {
    ...p,
    decks: { ...p.decks, [kind]: { ...p.decks[kind], [id]: card } },
    log: { ...p.log, [key]: l },
    rewards: { ...p.rewards, coins: p.rewards.coins + coins },
    updatedAt: now.getTime(),
  };
}

/** Suma un ejercicio de habla. `seconds`: lo que tardó (answerSeconds), para el tiempo de estudio. */
export function recordSpeaking(p: Progress, now: Date, seconds = 0): Progress {
  const key = dayKey(now);
  const l = { ...(p.log[key] ?? {}) };
  l.h = (l.h ?? 0) + 1;
  if (seconds > 0) l.t = (l.t ?? 0) + Math.round(seconds);
  const coins = l.h <= EARN.speakCap ? EARN.speak : 0;
  l.c = (l.c ?? 0) + coins;
  return { ...p, log: { ...p.log, [key]: l }, rewards: { ...p.rewards, coins: p.rewards.coins + coins }, updatedAt: now.getTime() };
}

/**
 * Suma una palabra escrita en papel que Danzi leyó bien. Da monedas solo si la persona la escribió de memoria
 * (`fromMemory`: no vio cómo se escribe) y hasta EARN.paperCap palabras al día; después sigue contando como práctica.
 * `seconds`: lo que tardó (answerSeconds), para el tiempo de estudio.
 */
export function recordPaper(p: Progress, now: Date, seconds: number, fromMemory: boolean): Progress {
  const key = dayKey(now);
  const l = { ...(p.log[key] ?? {}) };
  l.pa = (l.pa ?? 0) + 1;
  if (seconds > 0) l.t = (l.t ?? 0) + Math.round(seconds);
  const coins = fromMemory && l.pa <= EARN.paperCap ? EARN.paper : 0;
  l.c = (l.c ?? 0) + coins;
  return { ...p, log: { ...p.log, [key]: l }, rewards: { ...p.rewards, coins: p.rewards.coins + coins }, updatedAt: now.getTime() };
}

/** Cuántas palabras más en papel dan monedas hoy. */
export function paperCoinsLeft(p: Progress, now: Date): number {
  return Math.max(0, EARN.paperCap - todayLog(p, now).pa);
}

export function addExtraNew(p: Progress, kind: DeckKind, n: number, now: Date): Progress {
  const key = dayKey(now);
  const base = p.extra.date === key ? p.extra : { date: key, read: 0, write: 0 };
  return { ...p, extra: { ...base, [kind]: base[kind] + n }, updatedAt: now.getTime() };
}

/** Actividades de un día: tarjetas, palabras escritas, ejercicios de habla y palabras en papel. */
export function activities(l?: DayLog): number {
  return l ? (l.r ?? 0) + (l.w ?? 0) + (l.h ?? 0) + (l.pa ?? 0) : 0;
}

/** Si ese día hubo práctica (tarjetas, escritura, habla o papel). */
export function practiced(l?: DayLog): boolean {
  return activities(l) > 0;
}

/**
 * Días seguidos con práctica. Si hoy todavía no hay práctica, cuenta desde ayer.
 * Un día salvado por un protector no corta la racha, pero tampoco suma.
 */
export function streak(p: Progress, now: Date): number {
  const shielded = new Set(p.rewards.shielded);
  let i = practiced(p.log[dayKey(now)]) ? 0 : 1;
  let n = 0;
  for (;;) {
    const key = dayKey(addDays(now, -i));
    if (practiced(p.log[key])) n++;
    else if (!shielded.has(key)) break;
    i++;
  }
  return n;
}
