// Motor de la sincronización: decide qué subir y qué bajar en cada sincronización. No sabe de Supabase: recibe un
// «backend» (src/lib/cloud.ts usa Supabase; las pruebas, uno en memoria).
//
// La nube guarda un solo progreso por cuenta con un número de revisión (rev) que sube en cada cambio. Este
// dispositivo recuerda la revisión y el progreso de su última sincronización (SyncMeta, la «base»):
// - Si la nube sigue en esa revisión, solo hace falta subir lo de aquí, si cambió.
// - Si cambió, se junta con mergeProgress (src/lib/sync.ts), se guarda aquí y se sube.
// La subida solo vale si la nube sigue en la revisión leída; si otro dispositivo subió algo en el medio, se vuelve
// a leer y a juntar. Así dos dispositivos que sincronizan a la vez no se pisan.
import { normalizeProgress, type Progress } from './progress';
import { hasActivity, mergeProgress, sameProgress } from './sync';

export type RemoteRow = { datos: unknown; rev: number };

export interface SyncBackend {
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
  /** Revisión de la nube en ese momento. */
  rev: number;
  /** El progreso que quedó igual aquí y en la nube. */
  base: Progress;
  /** Cuándo (ms). */
  at: number;
  /** Se borró el progreso con la sesión iniciada: la próxima vez se sube tal cual, sin juntar, para borrarlo en todos lados. */
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
  now?: () => number;
};

const MAX_ATTEMPTS = 4;

export class SyncConflictError extends Error {
  constructor() {
    super('La nube cambió varias veces mientras se sincronizaba.');
  }
}

export async function syncProgress({ backend, user, meta: metaIn, getLocal, setLocal, now = Date.now }: SyncInput): Promise<SyncOutcome> {
  // Otra cuenta en este dispositivo: lo de antes no sirve de base.
  let meta = metaIn && metaIn.user === user ? metaIn : undefined;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const remote = await backend.fetch();

    if (!remote) {
      // La cuenta todavía no tiene progreso en la nube: se sube el de aquí.
      const local = getLocal();
      if (await backend.insert(local)) return { kind: 'subido', joinedFirstTime: false, meta: { user, rev: 1, base: local, at: now() } };
      continue; // Otro dispositivo lo creó primero: se vuelve a leer.
    }

    if (meta?.force) {
      const local = getLocal();
      const rev = await backend.update(local, remote.rev);
      if (rev !== null) return { kind: 'subido', joinedFirstTime: false, meta: { user, rev, base: local, at: now() } };
      continue;
    }

    if (meta && remote.rev === meta.rev) {
      // La nube no cambió desde la última vez: solo se sube lo de aquí, si cambió.
      const local = getLocal();
      if (sameProgress(local, meta.base)) return { kind: 'igual', joinedFirstTime: false, meta: { ...meta, at: now() } };
      const rev = await backend.update(local, remote.rev);
      if (rev !== null) return { kind: 'subido', joinedFirstTime: false, meta: { user, rev, base: local, at: now() } };
      continue;
    }

    // La nube cambió (o es la primera vez en este dispositivo): se junta.
    const remoteP = normalizeProgress(remote.datos);
    const local = getLocal();
    const first = !meta;
    const joinedFirstTime = first && hasActivity(local) && hasActivity(remoteP);
    // Un dispositivo sin nada hecho (recién instalado) toma lo de la nube tal cual.
    const merged = first && !hasActivity(local) ? remoteP : mergeProgress(meta?.base, local, remoteP);
    setLocal(merged);
    if (sameProgress(merged, remoteP)) return { kind: 'bajado', joinedFirstTime, meta: { user, rev: remote.rev, base: merged, at: now() } };
    const rev = await backend.update(merged, remote.rev);
    if (rev !== null) return { kind: 'juntado', joinedFirstTime, meta: { user, rev, base: merged, at: now() } };
    // Otro dispositivo subió algo en el medio. Aquí ya quedó lo juntado, que sale de esa versión de la nube:
    // esa es la base para juntar otra vez.
    meta = { user, rev: remote.rev, base: remoteP, at: now() };
  }
  throw new SyncConflictError();
}
