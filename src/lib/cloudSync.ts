// Motor de la sincronización: decide qué subir y qué bajar en cada sincronización. No sabe de Supabase: recibe un
// «backend» (src/lib/cloud.ts usa Supabase; las pruebas, uno en memoria).
//
// La nube guarda un solo progreso por cuenta con un número de revisión (rev) que sube en cada cambio. Este
// dispositivo recuerda la revisión y el progreso de su última sincronización (SyncMeta, la «base»):
// - Si la nube sigue en esa revisión, solo hace falta subir lo de aquí, si cambió. Para saberlo basta con pedir la
//   revisión, una consulta pequeña: el progreso completo solo se descarga cuando cambió.
// - Si cambió, se junta con mergeProgress (src/lib/sync.ts), se guarda aquí y se sube.
// La subida solo vale si la nube sigue en la revisión leída; si otro dispositivo subió algo en el medio, se vuelve
// a leer y a juntar. Así dos dispositivos que sincronizan a la vez no se pisan.
//
// Si la app se cierra en medio, la próxima vez no se puede perder nada ni contar dos veces:
// - Antes de cada subida se guardan aquí el progreso y la base de la que sale (`save`), en una sola operación.
// - Si la subida llegó pero la app se cerró antes de anotarla, lo de aquí queda igual a la nube: se toma tal cual.
import { normalizeProgress, PROGRESS_VERSION, type Progress } from './progress';
import { hasActivity, mergeProgress, sameProgress } from './sync';

export type RemoteRow = { datos: unknown; rev: number };

export interface SyncBackend {
  /** Solo la revisión de la nube, o null si esta cuenta todavía no tiene progreso. */
  fetchRev(): Promise<number | null>;
  /** El progreso guardado en la nube, o null si esta cuenta todavía no tiene. */
  fetch(): Promise<RemoteRow | null>;
  /** Lo crea con la revisión 1. false si ya existía (otro dispositivo lo creó primero). */
  insert(datos: Progress): Promise<boolean>;
  /** Lo reemplaza solo si sigue en la revisión `rev`. La revisión nueva, o null si cambió en el medio. */
  update(datos: Progress, rev: number): Promise<number | null>;
}

/** Lo que este dispositivo recuerda de su última sincronización (IndexedDB, fuera de Progress). */
export type SyncMeta = {
  /** La cuenta con la que se sincronizó. */
  user: string;
  /** Revisión de la nube en ese momento (0 si todavía no se sincronizó). */
  rev: number;
  /** El progreso que quedó igual aquí y en la nube. */
  base: Progress;
  /** Cuándo (ms). */
  at: number;
  /** Se reemplazó el progreso con la sesión iniciada (se borró o se cargó un archivo): la próxima vez se sube tal
   * cual, sin juntar, para que quede igual en todos lados. */
  force?: boolean;
};

export type SyncOutcome = {
  /** subido: la nube quedó con lo de aquí; bajado: aquí quedó lo de la nube; juntado: los dos cambiaron; igual: nada que hacer. */
  kind: 'subido' | 'bajado' | 'juntado' | 'igual';
  /** Primera sincronización en la que los dos lados ya tenían progreso: se juntaron. */
  joinedFirstTime: boolean;
  meta: SyncMeta;
};

export type SyncInput = {
  backend: SyncBackend;
  user: string;
  meta: SyncMeta | undefined;
  getLocal: () => Progress;
  setLocal: (p: Progress) => void;
  /** Guarda en el dispositivo, juntos, el progreso de aquí y esta base. Se llama antes de cada subida. */
  save?: (meta: SyncMeta | undefined) => Promise<void>;
  now?: () => number;
};

const MAX_ATTEMPTS = 4;

export class SyncConflictError extends Error {
  constructor() {
    super('La nube cambió varias veces mientras se sincronizaba.');
    this.name = 'SyncConflictError';
  }
}

/** El progreso de la nube viene de una versión más nueva de Danzi: esta no lo entiende y no debe pisarlo. */
export class SyncFormatError extends Error {
  constructor() {
    super('El progreso de la nube es de una versión más nueva de Danzi.');
    this.name = 'SyncFormatError';
  }
}

function newerFormat(datos: unknown): boolean {
  const v = datos && typeof datos === 'object' ? (datos as { v?: unknown }).v : undefined;
  return typeof v === 'number' && v > PROGRESS_VERSION;
}

/** Lee lo guardado en IndexedDB. Si no sirve, undefined: la próxima sincronización será como la primera. */
export function normalizeMeta(raw: unknown): SyncMeta | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const m = raw as Record<string, unknown>;
  if (typeof m.user !== 'string' || !m.user || !Number.isInteger(m.rev) || (m.rev as number) < 0) return undefined;
  if (!m.base || typeof m.base !== 'object') return undefined;
  const meta: SyncMeta = { user: m.user, rev: m.rev as number, base: normalizeProgress(m.base), at: Number(m.at) || 0 };
  if (m.force === true) meta.force = true;
  return meta;
}

export async function syncProgress({ backend, user, meta: metaIn, getLocal, setLocal, save = async () => {}, now = Date.now }: SyncInput): Promise<SyncOutcome> {
  // Otra cuenta en este dispositivo: lo de antes no sirve de base.
  let meta = metaIn && metaIn.user === user ? metaIn : undefined;
  let joinedFirstTime = false;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (meta && !meta.force && meta.rev > 0 && (await backend.fetchRev()) === meta.rev) {
      // La nube no cambió desde la última vez: solo se sube lo de aquí, si cambió.
      const local = getLocal();
      if (sameProgress(local, meta.base)) return { kind: 'igual', joinedFirstTime, meta: { ...meta, at: now() } };
      await save(meta);
      const rev = await backend.update(local, meta.rev);
      if (rev !== null) return { kind: 'subido', joinedFirstTime, meta: { user, rev, base: local, at: now() } };
      continue; // Otro dispositivo subió algo en el medio: se vuelve a leer.
    }

    const remote = await backend.fetch();
    if (!remote) {
      // La cuenta todavía no tiene progreso en la nube: se sube el de aquí.
      const local = getLocal();
      await save(meta);
      if (await backend.insert(local)) return { kind: 'subido', joinedFirstTime, meta: { user, rev: 1, base: local, at: now() } };
      continue; // Otro dispositivo lo creó primero: se vuelve a leer.
    }
    if (newerFormat(remote.datos)) throw new SyncFormatError();
    const remoteP = normalizeProgress(remote.datos);
    const local = getLocal();

    // Aquí ya está lo mismo que en la nube (por ejemplo, la subida anterior llegó pero la app se cerró antes de
    // anotarla): esa versión es la base, sin juntar nada.
    if (sameProgress(local, remoteP)) return { kind: 'igual', joinedFirstTime, meta: { user, rev: remote.rev, base: remoteP, at: now() } };

    if (meta?.force) {
      await save(meta);
      const rev = await backend.update(local, remote.rev);
      if (rev !== null) return { kind: 'subido', joinedFirstTime, meta: { user, rev, base: local, at: now() } };
      continue;
    }

    // La nube cambió (o es la primera vez en este dispositivo): se junta.
    const first = !meta;
    if (first && hasActivity(local) && hasActivity(remoteP)) joinedFirstTime = true;
    // Un dispositivo sin nada hecho (recién instalado) toma lo de la nube tal cual.
    const merged = first && !hasActivity(local) ? remoteP : mergeProgress(meta?.base, local, remoteP);
    setLocal(merged);
    // Desde aquí, lo de este dispositivo sale de esta versión de la nube: es la base si hay que volver a juntar.
    meta = { user, rev: remote.rev, base: remoteP, at: now() };
    if (sameProgress(merged, remoteP)) return { kind: 'bajado', joinedFirstTime, meta };
    await save(meta);
    const rev = await backend.update(merged, remote.rev);
    if (rev !== null) return { kind: 'juntado', joinedFirstTime, meta: { user, rev, base: merged, at: now() } };
  }
  throw new SyncConflictError();
}
