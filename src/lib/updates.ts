// Actualización automática de la APK: qué hacer con el aviso de versión nueva (actualizacion.json).
// El workflow android.yml publica ese archivo en Releases junto a cada APK, con el paquete web (danzi-web.zip).
// Aquí van las funciones puras; el código que habla con el celular está en src/native/updates.ts.

const RELEASES = 'https://github.com/alejo452/Danzi/releases';

/** El aviso de la versión más reciente. */
export const MANIFEST_URL = `${RELEASES}/latest/download/actualizacion.json`;
/** La APK más reciente, para cuando la versión nueva necesita instalarla. */
export const APK_URL = `${RELEASES}/latest/download/danzi.apk`;
/** Los paquetes web solo se descargan de las versiones publicadas en este repositorio. */
const BUNDLE_PREFIX = `${RELEASES}/download/`;

/** Lo que publica android.yml junto a cada APK (scripts/update-manifest.mjs). */
export type UpdateManifest = {
  /** Versión de la parte web: el número de ejecución del workflow. La APK de esa ejecución es la 1.<version>. */
  version: number;
  /** El paquete web: el zip de dist/. */
  url: string;
  /** SHA-256 del zip, en hexadecimal. El plugin no usa el paquete si no coincide. */
  sha256: string;
  /** La APK más antigua (versionCode) que puede usar esta versión web. Sube cuando cambia la parte de Android. */
  apkMinima: number;
};

const isVersion = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0;

/** Lee el aviso descargado. Devuelve null si no tiene la forma esperada o el paquete no es de este repositorio. */
export function parseManifest(data: unknown): UpdateManifest | null {
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== 'object') return null;
  const { version, url, sha256, apkMinima } = data as Record<string, unknown>;
  if (!isVersion(version) || !isVersion(apkMinima) || apkMinima > version) return null;
  if (typeof url !== 'string' || !url.startsWith(BUNDLE_PREFIX) || !url.endsWith('.zip')) return null;
  if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) return null;
  return { version, url, sha256, apkMinima };
}

export type UpdateDecision =
  /** La versión publicada no es más nueva que la que corre. */
  | { kind: 'al-dia' }
  | { kind: 'descargar'; manifest: UpdateManifest }
  /** La versión nueva necesita una APK más reciente: cambió la parte de Android. */
  | { kind: 'necesita-apk'; version: number }
  /** Esta versión ya se intentó y no arrancó: no se vuelve a descargar. */
  | { kind: 'fallo-antes'; version: number };

/**
 * Qué hacer con la versión publicada.
 * @param webVersion versión de la parte web que está corriendo (__DANZI_VERSION__).
 * @param apkVersion versionCode de la APK instalada.
 * @param failed versiones que ya fallaron al arrancar en este celular.
 */
export function decideUpdate(manifest: UpdateManifest, webVersion: number, apkVersion: number, failed: readonly number[]): UpdateDecision {
  if (manifest.version <= webVersion) return { kind: 'al-dia' };
  if (apkVersion < manifest.apkMinima) return { kind: 'necesita-apk', version: manifest.version };
  if (failed.includes(manifest.version)) return { kind: 'fallo-antes', version: manifest.version };
  return { kind: 'descargar', manifest };
}

/** Lo que se guarda en el dispositivo (IndexedDB), fuera de Progress: no pasa a otro dispositivo con el progreso. */
export type UpdateState = {
  /** Versiones que no arrancaron en este celular (las últimas 20). */
  fallidas: number[];
  /** La versión más nueva que ya corrió, para avisar cuando la app cambia de versión. */
  vista?: number;
  /** Cuándo se buscó la última vez (ms). */
  revisada?: number;
};

export const UPDATE_STATE_KEY = 'actualizacion';

export function normalizeUpdateState(raw: unknown): UpdateState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const fallidas = Array.isArray(r.fallidas) ? r.fallidas.filter(isVersion).slice(-20) : [];
  return {
    fallidas,
    ...(isVersion(r.vista) ? { vista: r.vista } : {}),
    ...(typeof r.revisada === 'number' && Number.isFinite(r.revisada) ? { revisada: r.revisada } : {}),
  };
}

export function addFailed(state: UpdateState, version: number): UpdateState {
  if (!isVersion(version) || state.fallidas.includes(version)) return state;
  return { ...state, fallidas: [...state.fallidas, version].slice(-20) };
}

/** Al volver a la app (sin cerrarla) se busca de nuevo, como mucho cada 6 horas. Al abrirla, siempre. */
export const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

export function shouldCheck(lastCheck: number | undefined, now: number): boolean {
  return lastCheck === undefined || now - lastCheck >= CHECK_EVERY_MS || now < lastCheck;
}

/**
 * La APK instalada, a partir de su versionName: «1.<versionCode>» en la normal y «1.<versionCode>-pruebas» en
 * Danzi Pruebas (android.yml lo pasa con -PversionName y build.gradle agrega el sufijo). Las compilaciones
 * locales («dev») dan versión 0: no buscan actualizaciones.
 */
export function parseApkVersion(versionName: string): { apk: number; pruebas: boolean } {
  const pruebas = /-pruebas$/.test(versionName);
  const m = versionName.match(/^1\.(\d+)(?:-pruebas)?$/);
  return { apk: m ? Number(m[1]) : 0, pruebas };
}

/** Cómo se muestra una versión: igual que en Releases («versión 1.123»). */
export function versionLabel(version: number): string {
  return `1.${version}`;
}
