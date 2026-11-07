// Recompensas: meta diaria y sobre rojo (红包), protectores de racha, sellos (印章), tienda y calendario.
// Funciones puras, como progress.ts: reciben un progreso y devuelven uno nuevo.
import { LEVELS, levelOfId } from '../data/levelList';
import { addDays, dayKey, fromDayKey } from './dates';
import { addCoins, MAX_SHIELDS, practiced, todayLog, type Progress } from './progress';
import { isMature } from './srs';

// ── Meta diaria y sobre rojo ────────────────────────────────────────────────────────────────

export const DAILY_GOALS = [10, 20, 30, 50];

/** Actividades de hoy que cuentan para la meta: tarjetas, palabras escritas y ejercicios de habla. */
export function activityToday(p: Progress, now: Date): number {
  const t = todayLog(p, now);
  return t.r + t.w + t.h;
}

export function goalProgress(p: Progress, now: Date): { done: number; goal: number; reached: boolean } {
  const done = activityToday(p, now);
  const goal = p.settings.dailyGoal;
  return { done, goal, reached: done >= goal };
}

/** Monedas del sobre rojo de un día: entre 10 y 25, y siempre las mismas para ese día. */
export function envelopeAmount(day: string): number {
  let h = 2166136261;
  for (const ch of day) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return 10 + ((h >>> 0) % 16);
}

export function canOpenEnvelope(p: Progress, now: Date): boolean {
  return goalProgress(p, now).reached && !(dayKey(now) in p.rewards.envelopes);
}

/** Abre el sobre rojo de hoy, si la meta está cumplida y no se ha abierto. */
export function openEnvelope(p: Progress, now: Date): { p: Progress; amount: number } {
  if (!canOpenEnvelope(p, now)) return { p, amount: 0 };
  const day = dayKey(now);
  const amount = envelopeAmount(day);
  // Basta con recordar los sobres de los últimos 120 días.
  const cutoff = dayKey(addDays(now, -120));
  const envelopes: Record<string, number> = {};
  for (const [d, n] of Object.entries(p.rewards.envelopes)) if (d >= cutoff) envelopes[d] = n;
  envelopes[day] = amount;
  return { p: addCoins({ ...p, rewards: { ...p.rewards, envelopes } }, amount, now), amount };
}

// ── Racha y protectores ─────────────────────────────────────────────────────────────────────

/** Si el día cuenta para la racha: hubo práctica o lo salvó un protector. */
function covered(p: Progress, key: string): boolean {
  return practiced(p.log[key]) || p.rewards.shielded.includes(key);
}

/**
 * Usa protectores para los días sin práctica justo antes de hoy. Solo si alcanzan para cubrirlos
 * todos y si antes había una racha que salvar; si no, no gasta ninguno.
 */
export function applyShields(p: Progress, now: Date): { p: Progress; used: number } {
  const { shields } = p.rewards;
  if (!shields) return { p, used: 0 };
  const key = (i: number) => dayKey(addDays(now, -i));
  let i = 1;
  while (i <= shields && !covered(p, key(i))) i++;
  const missed = i - 1;
  if (!missed || !covered(p, key(i))) return { p, used: 0 };
  const days = Array.from({ length: missed }, (_, k) => key(k + 1));
  return {
    p: { ...p, rewards: { ...p.rewards, shields: shields - missed, shielded: [...p.rewards.shielded, ...days].sort() } },
    used: missed,
  };
}

/** La racha más larga que has tenido (los días salvados por un protector unen, pero no suman). */
export function bestStreak(p: Progress): number {
  const days = [...new Set([...Object.keys(p.log).filter((d) => practiced(p.log[d])), ...p.rewards.shielded])].sort();
  let best = 0;
  let run = 0;
  let prev = '';
  for (const d of days) {
    if (!prev || dayKey(addDays(fromDayKey(prev), 1)) !== d) run = 0;
    if (practiced(p.log[d])) run++;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

// ── Tienda ──────────────────────────────────────────────────────────────────────────────────

export const SHIELD_PRICE = 50;

export type Theme = { id: string; name: string; desc: string; price: number };

/** Temas de color. Sus colores están en src/styles.css (:root[data-accent="…"]), con versión oscura. */
export const THEMES: Theme[] = [
  { id: 'laca', name: 'Laca', desc: 'El rojo laca de siempre.', price: 0 },
  { id: 'jade', name: 'Jade', desc: 'Verde jade, la piedra de la buena suerte.', price: 150 },
  { id: 'tinta', name: 'Tinta', desc: 'Azul tinta, sereno y profundo.', price: 150 },
  { id: 'oro', name: 'Oro', desc: 'Dorado imperial.', price: 250 },
  { id: 'ciruelo', name: 'Ciruelo', desc: 'Flor de ciruelo, que florece en invierno.', price: 250 },
];

export type BuyResult = { ok: true; p: Progress } | { ok: false; reason: 'coins' | 'max' | 'owned' | 'unknown'; missing?: number };

export function buyShield(p: Progress, now: Date): BuyResult {
  const r = p.rewards;
  if (r.shields >= MAX_SHIELDS) return { ok: false, reason: 'max' };
  if (r.coins < SHIELD_PRICE) return { ok: false, reason: 'coins', missing: SHIELD_PRICE - r.coins };
  return { ok: true, p: { ...p, rewards: { ...r, coins: r.coins - SHIELD_PRICE, shields: r.shields + 1 }, updatedAt: now.getTime() } };
}

/** Compra un tema y lo deja activo. */
export function buyTheme(p: Progress, id: string, now: Date): BuyResult {
  const theme = THEMES.find((t) => t.id === id);
  const r = p.rewards;
  if (!theme) return { ok: false, reason: 'unknown' };
  if (r.themes.includes(id)) return { ok: false, reason: 'owned' };
  if (r.coins < theme.price) return { ok: false, reason: 'coins', missing: theme.price - r.coins };
  return { ok: true, p: { ...p, rewards: { ...r, coins: r.coins - theme.price, themes: [...r.themes, id], theme: id }, updatedAt: now.getTime() } };
}

export function selectTheme(p: Progress, id: string, now: Date): Progress {
  if (!p.rewards.themes.includes(id)) return p;
  return { ...p, rewards: { ...p.rewards, theme: id }, updatedAt: now.getTime() };
}

// ── Sellos ──────────────────────────────────────────────────────────────────────────────────

export type SealStats = {
  /** Palabras vistas en tarjetas (de cualquier nivel). */
  learned: number;
  /** Palabras escritas al menos una vez. */
  written: number;
  /** Palabras dominadas (vuelven cada 21 días o más). */
  mastered: number;
  /** Ejercicios de habla en total. */
  spoke: number;
  /** Días en que hubo tarjetas, escritura y habla. */
  fullDays: number;
  best: number;
  /** Palabras vistas por nivel. */
  byLevel: Record<string, number>;
  /** Monedas ganadas en total. */
  earned: number;
  shieldedDays: number;
  envelopes: number;
};

export function sealStats(p: Progress): SealStats {
  const byLevel: Record<string, number> = {};
  let mastered = 0;
  for (const [id, card] of Object.entries(p.decks.read)) {
    const level = levelOfId(Number(id));
    if (level) byLevel[level] = (byLevel[level] ?? 0) + 1;
    if (isMature(card)) mastered++;
  }
  let spoke = 0;
  let fullDays = 0;
  let earned = 0;
  for (const l of Object.values(p.log)) {
    spoke += l.h ?? 0;
    earned += l.c ?? 0;
    if ((l.r ?? 0) > 0 && (l.w ?? 0) > 0 && (l.h ?? 0) > 0) fullDays++;
  }
  return {
    learned: Object.keys(p.decks.read).length,
    written: Object.keys(p.decks.write).length,
    mastered,
    spoke,
    fullDays,
    best: bestStreak(p),
    byLevel,
    earned,
    shieldedDays: p.rewards.shielded.length,
    envelopes: Object.keys(p.rewards.envelopes).length,
  };
}

export type Seal = {
  id: string;
  /** Lo que dice el sello, en chino. */
  hz: string;
  name: string;
  desc: string;
  coins: number;
  goal: number;
  value: (s: SealStats) => number;
};

const levelWords = (id: string) => LEVELS.find((l) => l.id === id)?.words ?? 0;

/** Sellos (印章). Cada uno se gana una sola vez y da monedas. Nunca cambies un id: es la clave en el progreso. */
export const SEALS: Seal[] = [
  { id: 'inicio', hz: '开始', name: 'Primer paso', desc: 'Aprende tu primera palabra.', coins: 10, goal: 1, value: (s) => s.learned },
  { id: 'diez', hz: '十', name: 'Diez palabras', desc: 'Aprende 10 palabras.', coins: 20, goal: 10, value: (s) => s.learned },
  { id: 'cien', hz: '百', name: 'Cien palabras', desc: 'Aprende 100 palabras.', coins: 60, goal: 100, value: (s) => s.learned },
  { id: 'quinientas', hz: '五百', name: 'Quinientas palabras', desc: 'Aprende 500 palabras.', coins: 150, goal: 500, value: (s) => s.learned },
  { id: 'mil', hz: '千', name: 'Mil palabras', desc: 'Aprende 1000 palabras: todo el HSK 1, 2 y 3.', coins: 300, goal: 1000, value: (s) => s.learned },
  { id: 'racha3', hz: '三天', name: 'Tres días seguidos', desc: 'Practica 3 días seguidos.', coins: 15, goal: 3, value: (s) => s.best },
  { id: 'racha7', hz: '一周', name: 'Una semana', desc: 'Practica 7 días seguidos.', coins: 40, goal: 7, value: (s) => s.best },
  { id: 'racha30', hz: '一个月', name: 'Un mes', desc: 'Practica 30 días seguidos.', coins: 150, goal: 30, value: (s) => s.best },
  { id: 'racha100', hz: '百日', name: 'Cien días', desc: 'Practica 100 días seguidos.', coins: 500, goal: 100, value: (s) => s.best },
  { id: 'pincel', hz: '写', name: 'Pincel', desc: 'Escribe tu primera palabra.', coins: 10, goal: 1, value: (s) => s.written },
  { id: 'caligrafo', hz: '写字', name: 'Calígrafo', desc: 'Escribe 100 palabras distintas.', coins: 100, goal: 100, value: (s) => s.written },
  { id: 'voz', hz: '说', name: 'Primera voz', desc: 'Haz tu primer ejercicio de habla.', coins: 10, goal: 1, value: (s) => s.spoke },
  { id: 'completo', hz: '一天', name: 'Día completo', desc: 'Repasa, escribe y habla el mismo día.', coins: 30, goal: 1, value: (s) => s.fullDays },
  { id: 'dominio', hz: '会', name: 'Lo dominas', desc: 'Domina 50 palabras: que vuelvan cada 21 días o más.', coins: 80, goal: 50, value: (s) => s.mastered },
  { id: 'hsk1', hz: '一级', name: 'HSK 1 completo', desc: 'Aprende todas las palabras del HSK 1.', coins: 150, goal: levelWords('1'), value: (s) => s.byLevel['1'] ?? 0 },
  { id: 'hsk2', hz: '二级', name: 'HSK 2 completo', desc: 'Aprende todas las palabras del HSK 2.', coins: 120, goal: levelWords('2'), value: (s) => s.byLevel['2'] ?? 0 },
  { id: 'hsk3', hz: '三级', name: 'HSK 3 completo', desc: 'Aprende todas las palabras del HSK 3.', coins: 250, goal: levelWords('3'), value: (s) => s.byLevel['3'] ?? 0 },
  { id: 'sobre', hz: '红包', name: 'Primer sobre rojo', desc: 'Cumple la meta del día y abre tu sobre rojo.', coins: 10, goal: 1, value: (s) => s.envelopes },
  { id: 'ahorro', hz: '钱', name: 'Ahorrador', desc: 'Gana 500 monedas en total.', coins: 50, goal: 500, value: (s) => s.earned },
  { id: 'salvado', hz: '安全', name: 'A salvo', desc: 'Un protector salvó tu racha.', coins: 20, goal: 1, value: (s) => s.shieldedDays },
];

/** Sellos ganados que todavía no se han recogido. */
export function pendingSeals(p: Progress): Seal[] {
  const s = sealStats(p);
  return SEALS.filter((seal) => !p.rewards.seals[seal.id] && seal.value(s) >= seal.goal);
}

/** Recoge sellos ganados y suma sus monedas. Los que no estén ganados se ignoran. */
export function claimSeals(p: Progress, ids: string[], now: Date): { p: Progress; coins: number } {
  const ready = new Set(pendingSeals(p).map((s) => s.id));
  const claimed = SEALS.filter((s) => ids.includes(s.id) && ready.has(s.id));
  if (!claimed.length) return { p, coins: 0 };
  const day = dayKey(now);
  const seals = { ...p.rewards.seals };
  for (const s of claimed) seals[s.id] = day;
  const coins = claimed.reduce((sum, s) => sum + s.coins, 0);
  return { p: addCoins({ ...p, rewards: { ...p.rewards, seals } }, coins, now), coins };
}

// ── Calendario ──────────────────────────────────────────────────────────────────────────────

export type CalendarDay = { key: string; day: number; inMonth: boolean };

/** Semanas de un mes (de lunes a domingo), con los días de relleno del mes anterior y del siguiente. */
export function monthWeeks(year: number, month: number): CalendarDay[][] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // lunes = 0
  const weeks: CalendarDay[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: CalendarDay[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(year, month, 1 - offset + w * 7 + d);
      week.push({ key: dayKey(date), day: date.getDate(), inMonth: date.getMonth() === month });
    }
    if (week.some((x) => x.inMonth)) weeks.push(week);
  }
  return weeks;
}

export type DayStatus = 'practiced' | 'shielded' | 'today' | 'missed' | 'future';

export function dayStatus(p: Progress, key: string, today: string): DayStatus {
  if (practiced(p.log[key])) return 'practiced';
  if (p.rewards.shielded.includes(key)) return 'shielded';
  if (key === today) return 'today';
  return key > today ? 'future' : 'missed';
}

/** Días practicados y monedas ganadas en un mes. */
export function monthSummary(p: Progress, year: number, month: number): { days: number; coins: number } {
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
  let days = 0;
  let coins = 0;
  for (const [d, l] of Object.entries(p.log)) {
    if (!d.startsWith(prefix)) continue;
    if (practiced(l)) days++;
    coins += l.c ?? 0;
  }
  return { days, coins };
}

/** El primer mes con práctica, para no dejar navegar el calendario hacia meses vacíos. */
export function firstMonth(p: Progress, now: Date): { year: number; month: number } {
  const first = Object.keys(p.log).filter((d) => practiced(p.log[d])).sort()[0];
  const date = first ? fromDayKey(first) : now;
  return { year: date.getFullYear(), month: date.getMonth() };
}

/** El próximo sello de racha y cuántos días faltan. */
export function nextStreakSeal(p: Progress, current: number): { seal: Seal; left: number } | null {
  const seal = SEALS.filter((s) => s.id.startsWith('racha') && !p.rewards.seals[s.id]).find((s) => s.goal > current);
  return seal ? { seal, left: seal.goal - current } : null;
}
