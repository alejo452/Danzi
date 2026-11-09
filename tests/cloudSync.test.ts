import { describe, expect, it } from 'vitest';
import { normalizeMeta, syncProgress, SyncConflictError, SyncFormatError, type SyncBackend, type SyncMeta } from '../src/lib/cloudSync';
import { freshProgress, PROGRESS_VERSION, type Progress } from '../src/lib/progress';
import type { StoredCard } from '../src/lib/srs';
import { sameProgress } from '../src/lib/sync';

const card = (day: number): StoredCard => ({
  due: `2026-11-${String(day + 1).padStart(2, '0')}T00:00:00.000Z`,
  stability: 1,
  difficulty: 5,
  elapsed_days: 0,
  scheduled_days: 1,
  learning_steps: 0,
  reps: 1,
  lapses: 0,
  state: 2,
  last_review: `2026-11-${String(day).padStart(2, '0')}T12:00:00.000Z`,
});

const withCards = (ids: Record<string, number>, coins = 0, updatedAt = 1000): Progress => {
  const p = freshProgress();
  for (const [id, day] of Object.entries(ids)) p.decks.read[id] = card(day);
  p.rewards.coins = coins;
  p.updatedAt = updatedAt;
  return p;
};

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

/** Una nube en memoria. `beforeUpdate` simula otro dispositivo que sube algo justo antes. */
function memoryCloud(initial?: Progress) {
  const cloud = {
    row: initial ? { datos: clone(initial) as unknown, rev: 1 } : (null as { datos: unknown; rev: number } | null),
    fetches: 0,
    updates: 0,
    beforeUpdate: undefined as (() => void) | undefined,
  };
  const backend: SyncBackend = {
    fetchRev: async () => cloud.row?.rev ?? null,
    fetch: async () => {
      cloud.fetches++;
      return cloud.row ? clone(cloud.row) : null;
    },
    insert: async (datos) => {
      if (cloud.row) return false;
      cloud.row = { datos: clone(datos), rev: 1 };
      return true;
    },
    update: async (datos, rev) => {
      cloud.updates++;
      const hook = cloud.beforeUpdate;
      cloud.beforeUpdate = undefined;
      hook?.();
      if (!cloud.row || cloud.row.rev !== rev) return null;
      cloud.row = { datos: clone(datos), rev: rev + 1 };
      return rev + 1;
    },
  };
  return { cloud, backend };
}

function device(start: Progress) {
  let p = start;
  return { getLocal: () => p, setLocal: (q: Progress) => (p = q), get: () => p };
}

describe('motor de la sincronización', () => {
  it('si la cuenta no tiene progreso en la nube, sube el de este dispositivo', async () => {
    const { cloud, backend } = memoryCloud();
    const d = device(withCards({ a: 1 }, 5));
    const out = await syncProgress({ backend, user: 'u1', meta: undefined, getLocal: d.getLocal, setLocal: d.setLocal });
    expect(out.kind).toBe('subido');
    expect(out.meta.rev).toBe(1);
    expect(sameProgress(cloud.row!.datos as Progress, d.get())).toBe(true);
  });

  it('un dispositivo recién instalado toma lo de la nube tal cual', async () => {
    const remote = withCards({ a: 1, b: 2 }, 40, 5000);
    const { cloud, backend } = memoryCloud(remote);
    const d = device(freshProgress());
    const out = await syncProgress({ backend, user: 'u1', meta: undefined, getLocal: d.getLocal, setLocal: d.setLocal });
    expect(out.kind).toBe('bajado');
    expect(out.joinedFirstTime).toBe(false);
    expect(sameProgress(d.get(), remote)).toBe(true);
    expect(cloud.updates).toBe(0);
  });

  it('la primera vez, si los dos lados tienen progreso, los junta y avisa', async () => {
    const { cloud, backend } = memoryCloud(withCards({ a: 1 }, 30));
    const d = device(withCards({ a: 3, b: 2 }, 20));
    const out = await syncProgress({ backend, user: 'u1', meta: undefined, getLocal: d.getLocal, setLocal: d.setLocal });
    expect(out.kind).toBe('juntado');
    expect(out.joinedFirstTime).toBe(true);
    expect(d.get().decks.read).toEqual({ a: card(3), b: card(2) });
    expect(d.get().rewards.coins).toBe(30);
    expect(cloud.row!.rev).toBe(2);
    expect(sameProgress(cloud.row!.datos as Progress, d.get())).toBe(true);
  });

  it('si nada cambió, solo pregunta la revisión y no sube nada', async () => {
    const p = withCards({ a: 1 });
    const { cloud, backend } = memoryCloud(p);
    const meta: SyncMeta = { user: 'u1', rev: 1, base: p, at: 0 };
    const d = device(clone(p));
    const out = await syncProgress({ backend, user: 'u1', meta, getLocal: d.getLocal, setLocal: d.setLocal });
    expect(out.kind).toBe('igual');
    expect(cloud.fetches).toBe(0);
    expect(cloud.updates).toBe(0);
  });

  it('si solo cambió este dispositivo, sube sus cambios sin descargar el progreso', async () => {
    const p = withCards({ a: 1 });
    const { cloud, backend } = memoryCloud(p);
    const d = device(withCards({ a: 1, b: 4 }, 3, 2000));
    const out = await syncProgress({ backend, user: 'u1', meta: { user: 'u1', rev: 1, base: p, at: 0 }, getLocal: d.getLocal, setLocal: d.setLocal });
    expect(out.kind).toBe('subido');
    expect(out.meta.rev).toBe(2);
    expect(cloud.fetches).toBe(0);
    expect((cloud.row!.datos as Progress).decks.read).toEqual({ a: card(1), b: card(4) });
  });

  it('si la nube cambió, junta y sube el resultado', async () => {
    const base = withCards({ a: 1 }, 10);
    const { cloud, backend } = memoryCloud(base);
    // Otro dispositivo subió una tarjeta nueva y ganó 5 monedas.
    cloud.row = { datos: withCards({ a: 1, c: 5 }, 15, 3000), rev: 2 };
    const d = device(withCards({ a: 1, b: 4 }, 12, 2000));
    const out = await syncProgress({ backend, user: 'u1', meta: { user: 'u1', rev: 1, base, at: 0 }, getLocal: d.getLocal, setLocal: d.setLocal });
    expect(out.kind).toBe('juntado');
    expect(d.get().decks.read).toEqual({ a: card(1), b: card(4), c: card(5) });
    expect(d.get().rewards.coins).toBe(17);
    expect(cloud.row!.rev).toBe(3);
    expect(out.meta.rev).toBe(3);
  });

  it('si otro dispositivo sube algo en el medio, vuelve a leer y junta sin perder nada', async () => {
    const base = withCards({ a: 1 }, 10);
    const { cloud, backend } = memoryCloud(base);
    // Justo antes de subir, otro dispositivo sube su propia tarjeta y 4 monedas.
    cloud.beforeUpdate = () => {
      cloud.row = { datos: withCards({ a: 1, z: 6 }, 14, 4000), rev: 2 };
    };
    const d = device(withCards({ a: 1, b: 4 }, 13, 2000));
    const out = await syncProgress({ backend, user: 'u1', meta: { user: 'u1', rev: 1, base, at: 0 }, getLocal: d.getLocal, setLocal: d.setLocal });
    expect(d.get().decks.read).toEqual({ a: card(1), b: card(4), z: card(6) });
    expect(d.get().rewards.coins).toBe(17);
    expect(sameProgress(cloud.row!.datos as Progress, d.get())).toBe(true);
    expect(out.meta.rev).toBe(cloud.row!.rev);
  });

  it('si la primera vez otro dispositivo sube algo en el medio, igual avisa que juntó', async () => {
    const { cloud, backend } = memoryCloud(withCards({ a: 1 }, 30));
    cloud.beforeUpdate = () => {
      cloud.row = { datos: withCards({ a: 1, z: 6 }, 31), rev: 2 };
    };
    const d = device(withCards({ b: 2 }, 20));
    const out = await syncProgress({ backend, user: 'u1', meta: undefined, getLocal: d.getLocal, setLocal: d.setLocal });
    expect(out.joinedFirstTime).toBe(true);
    expect(d.get().decks.read).toEqual({ a: card(1), b: card(2), z: card(6) });
  });

  it('reemplazar con la sesión iniciada sube lo de aquí sin juntar', async () => {
    const base = withCards({ a: 1, b: 2 }, 50);
    const { cloud, backend } = memoryCloud(base);
    const d = device({ ...freshProgress(), updatedAt: 9000 });
    const out = await syncProgress({ backend, user: 'u1', meta: { user: 'u1', rev: 1, base, at: 0, force: true }, getLocal: d.getLocal, setLocal: d.setLocal });
    expect(out.kind).toBe('subido');
    expect(out.meta.force).toBeUndefined();
    expect((cloud.row!.datos as Progress).decks.read).toEqual({});
    expect((cloud.row!.datos as Progress).rewards.coins).toBe(0);
  });

  it('también reemplaza si este dispositivo todavía no había sincronizado', async () => {
    const { cloud, backend } = memoryCloud(withCards({ x: 1 }, 5));
    const local = withCards({ a: 2 }, 8, 9000);
    const d = device(local);
    const out = await syncProgress({ backend, user: 'u1', meta: { user: 'u1', rev: 0, base: local, at: 0, force: true }, getLocal: d.getLocal, setLocal: d.setLocal });
    expect(out.kind).toBe('subido');
    expect((cloud.row!.datos as Progress).decks.read).toEqual({ a: card(2) });
  });

  it('con otra cuenta no usa la base de la anterior', async () => {
    const { backend } = memoryCloud(withCards({ x: 1 }, 5));
    const d = device(withCards({ a: 2 }, 8));
    const out = await syncProgress({ backend, user: 'u2', meta: { user: 'u1', rev: 1, base: freshProgress(), at: 0 }, getLocal: d.getLocal, setLocal: d.setLocal });
    expect(out.joinedFirstTime).toBe(true);
    expect(d.get().decks.read).toEqual({ x: card(1), a: card(2) });
  });

  it('no toca el progreso de una versión más nueva de Danzi', async () => {
    const { cloud, backend } = memoryCloud();
    cloud.row = { datos: { ...withCards({ x: 1 }, 5), v: PROGRESS_VERSION + 1 }, rev: 3 };
    const local = withCards({ a: 2 }, 8);
    const d = device(local);
    await expect(syncProgress({ backend, user: 'u1', meta: { user: 'u1', rev: 2, base: local, at: 0 }, getLocal: d.getLocal, setLocal: d.setLocal })).rejects.toBeInstanceOf(SyncFormatError);
    expect(d.get()).toBe(local);
    expect(cloud.updates).toBe(0);
  });

  it('se rinde si la nube cambia todo el tiempo', async () => {
    const base = withCards({ a: 1 });
    const { cloud, backend } = memoryCloud(base);
    let rev = 1;
    const always = () => {
      rev++;
      cloud.row = { datos: withCards({ a: 1, ['k' + rev]: 2 }), rev };
      cloud.beforeUpdate = always;
    };
    cloud.beforeUpdate = always;
    const d = device(withCards({ a: 1, b: 3 }, 0, 2000));
    await expect(syncProgress({ backend, user: 'u1', meta: { user: 'u1', rev: 1, base, at: 0 }, getLocal: d.getLocal, setLocal: d.setLocal })).rejects.toBeInstanceOf(SyncConflictError);
  });
});

describe('si la app se cierra en medio de una sincronización', () => {
  // Base: 10 monedas. Otro dispositivo ganó 5 (la nube tiene 15) y este ganó 2 (tiene 12). Lo correcto son 17.
  const setup = () => {
    const base = withCards({ a: 1 }, 10);
    const { cloud, backend } = memoryCloud(base);
    cloud.row = { datos: withCards({ a: 1, c: 5 }, 15, 3000), rev: 2 };
    const meta: SyncMeta = { user: 'u1', rev: 1, base, at: 0 };
    return { cloud, backend, meta, local: withCards({ a: 1, b: 4 }, 12, 2000) };
  };

  /** Lo que quedó guardado en el dispositivo la última vez que se llamó a `save`. */
  function saver(d: ReturnType<typeof device>) {
    const disk = { progress: undefined as Progress | undefined, meta: undefined as SyncMeta | undefined };
    return { disk, save: async (meta: SyncMeta | undefined) => void Object.assign(disk, clone({ progress: d.get(), meta })) };
  }

  it('guarda lo juntado con la base de la que sale antes de subirlo', async () => {
    const { backend, meta, local } = setup();
    const d = device(local);
    const { disk, save } = saver(d);
    await syncProgress({ backend, user: 'u1', meta, getLocal: d.getLocal, setLocal: d.setLocal, save });
    expect(disk.progress!.rewards.coins).toBe(17);
    expect(disk.meta!.rev).toBe(2);
    expect(disk.meta!.base.rewards.coins).toBe(15);
  });

  it('si se cerró antes de subir, la próxima vez no cuenta nada dos veces', async () => {
    const { cloud, backend, meta, local } = setup();
    const d = device(local);
    const { disk, save } = saver(d);
    const crash: SyncBackend = { ...backend, update: async () => Promise.reject(new Error('la app se cerró')) };
    await expect(syncProgress({ backend: crash, user: 'u1', meta, getLocal: d.getLocal, setLocal: d.setLocal, save })).rejects.toThrow();
    // Al abrir de nuevo, el dispositivo tiene lo que se guardó.
    const again = device(disk.progress!);
    const out = await syncProgress({ backend, user: 'u1', meta: normalizeMeta(disk.meta), getLocal: again.getLocal, setLocal: again.setLocal });
    expect(again.get().rewards.coins).toBe(17);
    expect((cloud.row!.datos as Progress).rewards.coins).toBe(17);
    expect(out.meta.rev).toBe(3);
  });

  it('si se cerró después de subir y antes de anotarlo, toma lo de la nube sin juntar', async () => {
    const { cloud, backend, meta, local } = setup();
    const d = device(local);
    const { disk, save } = saver(d);
    const crash: SyncBackend = {
      ...backend,
      update: async (datos, rev) => {
        await backend.update(datos, rev);
        throw new Error('la app se cerró');
      },
    };
    await expect(syncProgress({ backend: crash, user: 'u1', meta, getLocal: d.getLocal, setLocal: d.setLocal, save })).rejects.toThrow();
    expect(cloud.row!.rev).toBe(3);
    const again = device(disk.progress!);
    const updates = cloud.updates;
    const out = await syncProgress({ backend, user: 'u1', meta: normalizeMeta(disk.meta), getLocal: again.getLocal, setLocal: again.setLocal });
    expect(out.kind).toBe('igual');
    expect(out.meta.rev).toBe(3);
    expect(again.get().rewards.coins).toBe(17);
    expect(cloud.updates).toBe(updates);
  });

  it('antes de subir solo sus cambios también guarda el progreso', async () => {
    const p = withCards({ a: 1 });
    const { backend } = memoryCloud(p);
    const d = device(withCards({ a: 1, b: 4 }, 3, 2000));
    const { disk, save } = saver(d);
    await syncProgress({ backend, user: 'u1', meta: { user: 'u1', rev: 1, base: p, at: 0 }, getLocal: d.getLocal, setLocal: d.setLocal, save });
    expect(disk.progress!.decks.read).toEqual({ a: card(1), b: card(4) });
    expect(disk.meta!.rev).toBe(1);
  });
});

describe('lo que el dispositivo recuerda de la última sincronización', () => {
  it('descarta datos que no sirven', () => {
    expect(normalizeMeta(undefined)).toBeUndefined();
    expect(normalizeMeta('hola')).toBeUndefined();
    expect(normalizeMeta({ user: '', rev: 1, base: {} })).toBeUndefined();
    expect(normalizeMeta({ user: 'u1', rev: 1.5, base: {} })).toBeUndefined();
    expect(normalizeMeta({ user: 'u1', rev: 2 })).toBeUndefined();
  });

  it('migra la base al formato actual y conserva el reemplazo pendiente', () => {
    const m = normalizeMeta({ user: 'u1', rev: 4, base: { decks: { read: { a: card(1) } } }, at: 123, force: true });
    expect(m?.rev).toBe(4);
    expect(m?.base.v).toBe(PROGRESS_VERSION);
    expect(m?.base.decks.read).toEqual({ a: card(1) });
    expect(m?.force).toBe(true);
    expect(normalizeMeta({ user: 'u1', rev: 4, base: {}, at: 1, force: 'sí' })?.force).toBeUndefined();
  });
});
