// Actualización automática de la APK con @capgo/capacitor-updater, en modo manual y sin servidores de Capgo
// (capacitor.config.ts apaga sus búsquedas y sus estadísticas).
//
// Al abrir la app:
// 1. Confirma que esta versión arrancó bien (notifyAppReady). Si una versión nueva no llega a confirmarlo en
//    15 segundos, el plugin vuelve solo a la anterior; esa versión queda en la lista de fallidas y no se reintenta.
// 2. Busca en Releases el aviso de la versión más reciente (actualizacion.json, ver src/lib/updates.ts).
// 3. Si es más nueva y sirve para esta APK, descarga el paquete web (el plugin comprueba su SHA-256) y lo deja
//    como siguiente: se usa la próxima vez que la app pase a segundo plano o se vuelva a abrir.
//    Si necesita una APK más reciente (cambió la parte de Android), Ajustes lo dice con el enlace para instalarla.
// Danzi Pruebas no se actualiza sola: se prueba con la versión de cada pull request.
//
// Solo se carga dentro de la APK (ver src/lib/native.ts).
import { CapacitorHttp } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { get, set } from 'idb-keyval';
import { toast } from '../lib/toasts';
import {
  MANIFEST_URL,
  UPDATE_STATE_KEY,
  addFailed,
  decideUpdate,
  normalizeUpdateState,
  parseApkVersion,
  parseManifest,
  shouldCheck,
  versionLabel,
  type UpdateState,
} from '../lib/updates';

/** Versión de la parte web que está corriendo (la APK de esa compilación es la 1.<versión>). */
export const WEB_VERSION: number = __DANZI_VERSION__;

export type UpdateStatus =
  | { kind: 'revisando' }
  | { kind: 'al-dia' }
  | { kind: 'descargando'; version: number }
  /** Descargada: se usa la próxima vez que vuelvas a la app. */
  | { kind: 'lista'; version: number }
  | { kind: 'necesita-apk'; version: number }
  /** Esa versión no arrancó en este celular: sigue la anterior. */
  | { kind: 'fallo'; version: number }
  | { kind: 'sin-conexion' }
  /** El plugin no respondió. */
  | { kind: 'error' }
  | { kind: 'pruebas' }
  /** Compilación local, sin número de versión. */
  | { kind: 'desarrollo' };

let status: UpdateStatus = { kind: 'revisando' };
let apk = 0;
const listeners = new Set<(s: UpdateStatus) => void>();

function setStatus(s: UpdateStatus): void {
  status = s;
  listeners.forEach((l) => l(s));
}

export function getStatus(): UpdateStatus {
  return status;
}

/** La APK instalada (versionCode). */
export function apkVersion(): number {
  return apk;
}

export function onStatus(listener: (s: UpdateStatus) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function loadState(): Promise<UpdateState> {
  try {
    return normalizeUpdateState(await get(UPDATE_STATE_KEY));
  } catch {
    return normalizeUpdateState(undefined);
  }
}

async function saveState(state: UpdateState): Promise<void> {
  try {
    await set(UPDATE_STATE_KEY, state);
  } catch {
    // Sin IndexedDB solo se pierde la lista de versiones fallidas; la app sigue igual.
  }
}

let started: Promise<void> | null = null;
let checking: Promise<void> | null = null;
let pruebas = false;

/** Se llama una vez, al abrir la app (App.tsx). Nunca falla: si el plugin no responde, el estado queda en «error». */
export function startUpdates(): Promise<void> {
  started ??= start().catch(() => setStatus({ kind: 'error' }));
  return started;
}

async function start(): Promise<void> {
  // Lo primero: confirmar que esta versión arrancó. Sin esto, el plugin vuelve a la versión anterior.
  await CapacitorUpdater.notifyAppReady();

  let state = await loadState();
  const failed = await CapacitorUpdater.getFailedUpdate().catch(() => null);
  if (failed?.bundle?.version) state = addFailed(state, Number(failed.bundle.version));
  if (state.vista && WEB_VERSION > state.vista) toast(`Danzi se actualizó a la versión ${versionLabel(WEB_VERSION)}.`);
  if (WEB_VERSION > (state.vista ?? 0)) state = { ...state, vista: WEB_VERSION };
  await saveState(state);

  const builtin = await CapacitorUpdater.getBuiltinVersion().catch(() => ({ version: '' }));
  ({ apk, pruebas } = parseApkVersion(builtin.version ?? ''));

  // Al volver a la app sin cerrarla, busca de nuevo (como mucho cada 6 horas).
  document.addEventListener('resume', () => void checkForUpdate(false));
  await checkForUpdate(true);
}

/** Busca la versión nueva y la descarga. `force`: buscar aunque se haya buscado hace poco (al abrir y con el botón). */
export function checkForUpdate(force: boolean): Promise<void> {
  if (pruebas) {
    setStatus({ kind: 'pruebas' });
    return Promise.resolve();
  }
  if (WEB_VERSION <= 0 || apk <= 0) {
    setStatus({ kind: 'desarrollo' });
    return Promise.resolve();
  }
  checking ??= check(force).finally(() => {
    checking = null;
  });
  return checking;
}

async function check(force: boolean): Promise<void> {
  let state = await loadState();
  const now = Date.now();
  if (!force && !shouldCheck(state.revisada, now)) return;

  // Si ya hay una versión descargada esperando, se sigue mostrando mientras se busca otra más nueva.
  const pending = await CapacitorUpdater.getNextBundle().catch(() => null);
  const pendingVersion = Number(pending?.version) || 0;
  if (pendingVersion <= WEB_VERSION) setStatus({ kind: 'revisando' });

  let manifest;
  try {
    const res = await CapacitorHttp.get({
      url: MANIFEST_URL,
      headers: { 'Cache-Control': 'no-cache' },
      responseType: 'text',
      connectTimeout: 15_000,
      readTimeout: 15_000,
    });
    manifest = res.status === 200 ? parseManifest(res.data) : null;
  } catch {
    manifest = null;
  }
  if (!manifest) {
    setStatus(pendingVersion > WEB_VERSION ? { kind: 'lista', version: pendingVersion } : { kind: 'sin-conexion' });
    return;
  }
  state = { ...(await loadState()), revisada: now };
  await saveState(state);

  const decision = decideUpdate(manifest, WEB_VERSION, apk, state.fallidas);
  if (decision.kind === 'al-dia') return setStatus(pendingVersion > WEB_VERSION ? { kind: 'lista', version: pendingVersion } : { kind: 'al-dia' });
  if (decision.kind === 'necesita-apk') return setStatus({ kind: 'necesita-apk', version: decision.version });
  if (decision.kind === 'fallo-antes') return setStatus({ kind: 'fallo', version: decision.version });
  if (pendingVersion >= manifest.version) return setStatus({ kind: 'lista', version: pendingVersion });

  setStatus({ kind: 'descargando', version: manifest.version });
  try {
    const bundle = await CapacitorUpdater.download({ url: manifest.url, version: String(manifest.version), checksum: manifest.sha256 });
    await CapacitorUpdater.next({ id: bundle.id });
    // La versión que esperaba antes ya no hace falta.
    if (pending && pending.id !== bundle.id && pendingVersion > 0) await CapacitorUpdater.delete({ id: pending.id }).catch(() => undefined);
    setStatus({ kind: 'lista', version: manifest.version });
  } catch {
    setStatus(pendingVersion > WEB_VERSION ? { kind: 'lista', version: pendingVersion } : { kind: 'sin-conexion' });
  }
}
