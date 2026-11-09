// Sincronización entre dispositivos: cómo se juntan dos progresos. Funciones puras.
//
// mergeProgress(base, local, remoto) junta el progreso de este dispositivo con el de la nube.
//
// Con base (el progreso que quedó igual aquí y en la nube después de la última sincronización) es una mezcla de
// tres vías: lo que cambió de un solo lado se toma de ese lado, también si se borró. Si cambió en los dos:
// - tarjetas: la que se repasó más recientemente;
// - actividad de cada día, monedas y protectores: se suman los cambios de los dos lados (base + Δlocal + Δremoto),
//   así cuenta lo que se hizo en cada dispositivo;
// - sobres rojos, sellos, días salvados y temas comprados: se unen;
// - ajustes y tema activo: gana el cambio de este dispositivo.
//
// Sin base (la primera vez en este dispositivo, o después de cargar un archivo) se toma lo mayor de cada lado:
// la tarjeta más reciente, el máximo de cada contador y de las monedas, la unión de sellos y temas. Así nunca se
// pierde nada ni se cuenta dos veces lo que ya estaba en los dos lados (por ejemplo, si se pasó con un archivo).
import { DEFAULT_THEME, MAX_SHIELDS, PROGRESS_VERSION, type DayLog, type Progress, type Rewards, type Settings } from './progress';
import type { Deck } from './queue';
import type { StoredCard } from './srs';

/** JSON con las claves en orden: dos objetos con el mismo contenido dan el mismo texto. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

const same = (a: unknown, b: unknown) => stableStringify(a) === stableStringify(b);

/** Si dos progresos tienen el mismo contenido. */
export function sameProgress(a: Progress, b: Progress): boolean {
  return a === b || same(a, b);
}

const time = (iso?: string) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : -Infinity;
};

/** De dos versiones de la misma tarjeta, la que se repasó más recientemente (o la que tiene más repasos). */
export function newerCard(a: StoredCard, b: StoredCard): StoredCard {
  const ta = time(a.last_review);
  const tb = time(b.last_review);
  if (ta !== tb) return ta > tb ? a : b;
  if (a.reps !== b.reps) return a.reps > b.reps ? a : b;
  return time(a.due) >= time(b.due) ? a : b;
}

/**
 * Mezcla de tres vías de un objeto por claves. `both` resuelve las claves que cambiaron en los dos lados
 * (recibe undefined si un lado la borró).
 */
function mergeKeys<T>(
  base: Record<string, T> | undefined,
  local: Record<string, T>,
  remote: Record<string, T>,
  both: (l: T | undefined, r: T | undefined, b: T | undefined) => T | undefined,
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const k of new Set([...Object.keys(local), ...Object.keys(remote), ...Object.keys(base ?? {})])) {
    const l = local[k];
    const r = remote[k];
    let v: T | undefined;
    if (!base) v = l === undefined ? r : r === undefined ? l : both(l, r, undefined);
    else {
      const b = base[k];
      if (same(l, b)) v = r;
      else if (same(r, b)) v = l;
      else v = both(l, r, b);
    }
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function mergeDeck(base: Deck | undefined, local: Deck, remote: Deck): Deck {
  return mergeKeys(base, local, remote, (l, r) => (l && r ? newerCard(l, r) : (l ?? r)));
}

const LOG_FIELDS = ['r', 'n', 'w', 'wn', 'h', 'c'] as const;

/** Con base: base + Δlocal + Δremoto (nunca menos de 0). Sin base: el mayor. */
function mergeCount(b: number | undefined, l: number, r: number): number {
  return b === undefined ? Math.max(l, r) : Math.max(0, l + r - b);
}

function mergeDay(l: DayLog | undefined, r: DayLog | undefined, b: DayLog | undefined, hasBase: boolean): DayLog | undefined {
  const out: DayLog = {};
  for (const f of LOG_FIELDS) {
    const v = mergeCount(hasBase ? (b?.[f] ?? 0) : undefined, l?.[f] ?? 0, r?.[f] ?? 0);
    if (v > 0) out[f] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

function mergeLog(base: Record<string, DayLog> | undefined, local: Record<string, DayLog>, remote: Record<string, DayLog>) {
  return mergeKeys(base, local, remote, (l, r, b) => mergeDay(l, r, b, !!base));
}

function mergeExtra(base: Progress['extra'] | undefined, local: Progress['extra'], remote: Progress['extra']): Progress['extra'] {
  if (base && same(local, base)) return remote;
  if (base && same(remote, base)) return local;
  if (local.date !== remote.date) return local.date > remote.date ? local : remote;
  const b = base && base.date === local.date ? base : undefined;
  return {
    date: local.date,
    read: mergeCount(b ? b.read : base ? 0 : undefined, local.read, remote.read),
    write: mergeCount(b ? b.write : base ? 0 : undefined, local.write, remote.write),
  };
}

function mergeSettings(base: Settings | undefined, local: Settings, remote: Settings, localIsNewer: boolean): Settings {
  if (!base) return localIsNewer ? local : remote;
  const out = { ...remote } as Record<string, unknown>;
  const l = local as unknown as Record<string, unknown>;
  const b = base as unknown as Record<string, unknown>;
  for (const k of Object.keys(l)) if (!same(l[k], b[k])) out[k] = l[k];
  return out as unknown as Settings;
}

function mergeRewards(base: Rewards | undefined, local: Rewards, remote: Rewards, localIsNewer: boolean): Rewards {
  const themes = [...new Set([DEFAULT_THEME, ...local.themes, ...remote.themes])];
  const theme = base ? (local.theme !== base.theme ? local.theme : remote.theme) : localIsNewer ? local.theme : remote.theme;
  const seals: Record<string, string> = { ...remote.seals };
  for (const [id, day] of Object.entries(local.seals)) if (!seals[id] || day < seals[id]) seals[id] = day;
  const envelopes: Record<string, number> = { ...remote.envelopes };
  for (const [day, n] of Object.entries(local.envelopes)) envelopes[day] = Math.max(n, envelopes[day] ?? 0);
  return {
    coins: mergeCount(base?.coins, local.coins, remote.coins),
    envelopes,
    seals,
    shields: Math.min(MAX_SHIELDS, mergeCount(base?.shields, local.shields, remote.shields)),
    shielded: [...new Set([...local.shielded, ...remote.shielded])].sort(),
    theme: themes.includes(theme) ? theme : DEFAULT_THEME,
    themes,
  };
}

/**
 * Junta el progreso de este dispositivo (`local`) con el de la nube (`remote`).
 * `base` es el progreso de la última sincronización; sin él, la mezcla toma lo mayor de cada lado.
 */
export function mergeProgress(base: Progress | undefined, local: Progress, remote: Progress): Progress {
  const localIsNewer = local.updatedAt >= remote.updatedAt;
  return {
    v: PROGRESS_VERSION,
    decks: {
      read: mergeDeck(base?.decks.read, local.decks.read, remote.decks.read),
      write: mergeDeck(base?.decks.write, local.decks.write, remote.decks.write),
    },
    settings: mergeSettings(base?.settings, local.settings, remote.settings, localIsNewer),
    log: mergeLog(base?.log, local.log, remote.log),
    extra: mergeExtra(base?.extra, local.extra, remote.extra),
    rewards: mergeRewards(base?.rewards, local.rewards, remote.rewards, localIsNewer),
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
  };
}

/** Si el progreso tiene algo hecho (tarjetas, actividad o monedas). Uno sin nada se reemplaza sin preguntar. */
export function hasActivity(p: Progress): boolean {
  return Object.keys(p.decks.read).length + Object.keys(p.decks.write).length + Object.keys(p.log).length > 0 || p.rewards.coins > 0;
}
