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
//
// «Danzi Pruebas» sigue la versión de prueba de un pull request (Releases pruebas-pr-<número>): la del pull request
// del que salió su versión, o el que se elija en Ajustes. Una versión de prueba sirve sin reinstalar si se compiló
// con la misma parte de Android que la APK: al abrir la versión que trae la APK, la app guarda la huella de esa
// parte (__DANZI_HUELLA__) y la compara con la del aviso. Si no coincide, Ajustes da el enlace a la APK de prueba,
// que se instala encima porque todas las de prueba van firmadas con la misma llave (.github/pruebas).
//
// Solo se carga dentro de la APK (ver src/lib/native.ts).
import { CapacitorHttp } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { get, set } from 'idb-keyval';
import { toast } from '../lib/toasts';
import {
  APK_URL,
  MANIFEST_URL,
  TEST_CHECK_EVERY_MS,
  TEST_RELEASES_API,
  UPDATE_STATE_KEY,
  addFailed,
  decideTestUpdate,
  decideUpdate,
  normalizeUpdateState,
  parseApkVersion,
  parseManifest,
  parseTestReleases,
  shouldCheck,
  testApkUrl,
  testManifestUrl,
  versionLabel,
  type TestRelease,
  type UpdateManifest,
  type UpdateState,
} from '../lib/updates';

/** Versión de la parte web que está corriendo (la APK de esa compilación es la 1.<versión>). */
export const WEB_VERSION: number = __DANZI_VERSION__;
/** En «Danzi Pruebas», el pull request de la versión que corre (0 si no es una versión de prueba). */
export const WEB_PR: number = __DANZI_PR__;
const WEB_HUELLA: string = __DANZI_HUELLA__;

export type UpdateStatus =
  | { kind: 'revisando' }
  | { kind: 'al-dia' }
  | { kind: 'descargando'; version: number; pr?: number }
  /** Descargada: se usa la próxima vez que vuelvas a la app. */
  | { kind: 'lista'; version: number; pr?: number }
  /** «Danzi Pruebas» cambia ya a la versión elegida (la app se recarga). */
  | { kind: 'aplicando'; version: number; pr: number }
  | { kind: 'necesita-apk'; version: number; apkUrl: string; pr?: number }
  /** Esa versión no arrancó en este celular: sigue la anterior. */
  | { kind: 'fallo'; version: number }
  | { kind: 'sin-conexion' }
  /** El plugin no respondió. */
  | { kind: 'error' }
  /** Compilación local, sin número de versión. */
  | { kind: 'desarrollo' }
  /** «Danzi Pruebas»: no hay versión de prueba publicada de ese pull request (se cerró o todavía no sale). */
  | { kind: 'sin-version-prueba'; pr: number }
  /** «Danzi Pruebas» sin pull request para seguir. */
  | { kind: 'sin-pr' };

let status: UpdateStatus = { kind: 'revisando' };
let apk = 0;
let pruebas = false;
/** Si corre la parte web que trae la APK (y no una descargada). */
let builtin = true;
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

/** Si es «Danzi Pruebas». */
export function isPruebas(): boolean {
  return pruebas;
}

/** Si corre la parte web que trae la APK. */
export function runningBuiltin(): boolean {
  return builtin;
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

/** Se llama una vez, al abrir la app (App.tsx). Nunca falla: si el plugin no responde, el estado queda en «error». */
export function startUpdates(): Promise<void> {
  started ??= start().catch(() => setStatus({ kind: 'error' }));
  return started;
}

async function start(): Promise<void> {
  // Lo primero: confirmar que esta versión arrancó. Sin esto, el plugin vuelve a la versión anterior.
  const ready = await CapacitorUpdater.notifyAppReady();
  builtin = !ready?.bundle?.id || ready.bundle.id === 'builtin';
  const installed = await CapacitorUpdater.getBuiltinVersion().catch(() => ({ version: '' }));
  ({ apk, pruebas } = parseApkVersion(installed.version ?? ''));

  let state = await loadState();
  const failed = await CapacitorUpdater.getFailedUpdate().catch(() => null);
  if (failed?.bundle?.version) state = addFailed(state, Number(failed.bundle.version));
  if (state.vista && WEB_VERSION > state.vista) toast(`Danzi se actualizó a la versión ${versionLabel(WEB_VERSION)}.`);
  if (WEB_VERSION > (state.vista ?? 0)) state = { ...state, vista: WEB_VERSION };
  // La parte web que trae la APK se compiló con la misma parte de Android que la APK: su huella es la de la APK.
  if (builtin && apk > 0 && WEB_HUELLA) state = { ...state, apk: { version: apk, huella: WEB_HUELLA } };
  await saveState(state);

  // Al volver a la app sin cerrarla, busca de nuevo (cada 6 horas como mucho; en Danzi Pruebas, cada 5 minutos).
  document.addEventListener('resume', () => void checkForUpdate(false));
  await checkForUpdate(true);
}

/** Busca la versión nueva y la descarga. `force`: buscar aunque se haya buscado hace poco (al abrir y con el botón). */
export function checkForUpdate(force: boolean): Promise<void> {
  if (WEB_VERSION <= 0 || apk <= 0) {
    setStatus({ kind: 'desarrollo' });
    return Promise.resolve();
  }
  checking ??= (pruebas ? checkTest(force, false) : check(force)).finally(() => {
    checking = null;
  });
  return checking;
}

type Fetched = { status: number; data: unknown } | null;

async function fetchText(url: string, headers: Record<string, string> = {}): Promise<Fetched> {
  try {
    const res = await CapacitorHttp.get({
      url,
      headers: { 'Cache-Control': 'no-cache', ...headers },
      responseType: 'text',
      connectTimeout: 15_000,
      readTimeout: 15_000,
    });
    return { status: res.status, data: res.data };
  } catch {
    return null;
  }
}

/** La versión descargada que espera para la próxima vez (0 si no hay). */
async function pendingBundle(): Promise<{ id: string; version: number } | null> {
  const next = await CapacitorUpdater.getNextBundle().catch(() => null);
  const version = Number(next?.version) || 0;
  return next?.id && version > 0 ? { id: next.id, version } : null;
}

/**
 * Descarga el paquete web. `apply`: usarlo ya (la app se recarga); si no, queda para la próxima vez.
 * Devuelve false si no se pudo descargar.
 */
async function install(manifest: UpdateManifest, pending: { id: string } | null, apply: boolean): Promise<boolean> {
  try {
    const bundle = await CapacitorUpdater.download({ url: manifest.url, version: String(manifest.version), checksum: manifest.sha256 });
    // La versión que esperaba antes ya no hace falta.
    if (pending && pending.id !== bundle.id) await CapacitorUpdater.delete({ id: pending.id }).catch(() => undefined);
    if (apply) await CapacitorUpdater.set({ id: bundle.id });
    else await CapacitorUpdater.next({ id: bundle.id });
    return true;
  } catch {
    return false;
  }
}

async function check(force: boolean): Promise<void> {
  let state = await loadState();
  const now = Date.now();
  if (!force && !shouldCheck(state.revisada, now)) return;

  // Si ya hay una versión descargada esperando, se sigue mostrando mientras se busca otra más nueva.
  const pending = await pendingBundle();
  const waiting = pending && pending.version > WEB_VERSION ? pending.version : 0;
  if (!waiting) setStatus({ kind: 'revisando' });

  const res = await fetchText(MANIFEST_URL);
  const manifest = res?.status === 200 ? parseManifest(res.data) : null;
  if (!manifest) {
    setStatus(waiting ? { kind: 'lista', version: waiting } : { kind: 'sin-conexion' });
    return;
  }
  state = { ...(await loadState()), revisada: now };
  await saveState(state);

  const decision = decideUpdate(manifest, WEB_VERSION, apk, state.fallidas);
  if (decision.kind === 'al-dia') return setStatus(waiting ? { kind: 'lista', version: waiting } : { kind: 'al-dia' });
  if (decision.kind === 'necesita-apk') return setStatus({ kind: 'necesita-apk', version: decision.version, apkUrl: APK_URL });
  if (decision.kind === 'fallo-antes') return setStatus({ kind: 'fallo', version: decision.version });
  if (waiting >= manifest.version) return setStatus({ kind: 'lista', version: waiting });

  setStatus({ kind: 'descargando', version: manifest.version });
  const ok = await install(manifest, pending, false);
  setStatus(ok ? { kind: 'lista', version: manifest.version } : waiting ? { kind: 'lista', version: waiting } : { kind: 'sin-conexion' });
}

/** «Danzi Pruebas»: busca la versión de prueba del pull request que sigue. `apply`: usarla ya (al elegirla). */
async function checkTest(force: boolean, apply: boolean): Promise<void> {
  let state = await loadState();
  const now = Date.now();
  const pr = state.pr ?? WEB_PR;
  if (!pr) return setStatus({ kind: 'sin-pr' });
  if (!force && !shouldCheck(state.revisada, now, TEST_CHECK_EVERY_MS)) return;

  const pending = await pendingBundle();
  setStatus({ kind: 'revisando' });
  const res = await fetchText(testManifestUrl(pr));
  if (res?.status === 404) return setStatus({ kind: 'sin-version-prueba', pr });
  const manifest = res?.status === 200 ? parseManifest(res.data) : null;
  if (!manifest) return setStatus({ kind: 'sin-conexion' });
  state = { ...(await loadState()), revisada: now };
  await saveState(state);

  const apkHuella = state.apk?.version === apk ? state.apk.huella : undefined;
  const decision = decideTestUpdate(manifest, { webVersion: WEB_VERSION, webPr: WEB_PR, pr, apkHuella, failed: state.fallidas });
  if (decision.kind === 'al-dia') return setStatus({ kind: 'al-dia' });
  if (decision.kind === 'necesita-apk') return setStatus({ kind: 'necesita-apk', version: decision.version, apkUrl: testApkUrl(pr), pr });
  if (decision.kind === 'fallo-antes') return setStatus({ kind: 'fallo', version: decision.version });
  // Las versiones son números de ejecución del workflow, distintos en cada compilación: si coincide, es la misma.
  if (!apply && pending?.version === manifest.version) return setStatus({ kind: 'lista', version: manifest.version, pr });

  setStatus({ kind: 'descargando', version: manifest.version, pr });
  const ok = await install(manifest, pending, apply);
  if (!ok) return setStatus({ kind: 'sin-conexion' });
  setStatus(apply ? { kind: 'aplicando', version: manifest.version, pr } : { kind: 'lista', version: manifest.version, pr });
}

/** «Danzi Pruebas»: los pull requests abiertos con versión de prueba. null si no se pudo cargar la lista. */
export async function listTestReleases(): Promise<TestRelease[] | null> {
  const res = await fetchText(TEST_RELEASES_API, { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });
  return res?.status === 200 ? parseTestReleases(res.data) : null;
}

/** «Danzi Pruebas»: cambia a la versión de prueba de este pull request (la descarga y la usa ya). */
export async function chooseTestPr(pr: number): Promise<void> {
  await checking?.catch(() => undefined);
  await saveState({ ...(await loadState()), pr });
  checking = checkTest(true, true).finally(() => {
    checking = null;
  });
  return checking;
}

/** «Danzi Pruebas»: vuelve a la parte web que trae la APK y deja de seguir el pull request elegido. */
export async function resetToApk(): Promise<void> {
  const state = await loadState();
  delete state.pr;
  await saveState(state);
  await CapacitorUpdater.reset();
}
