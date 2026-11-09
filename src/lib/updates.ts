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
  /** Huella de la parte de Android con la que se compiló. «Danzi Pruebas» la compara con la de su APK. */
  huellaNativa?: string;
  /** En las versiones de prueba, el pull request del que salen. */
  pr?: number;
};

const isVersion = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0;
const isHash = (s: string) => /^[0-9a-f]{64}$/.test(s);

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
  const { version, url, sha256, apkMinima, huellaNativa, pr } = data as Record<string, unknown>;
  if (!isVersion(version) || !isVersion(apkMinima) || apkMinima > version) return null;
  if (typeof url !== 'string' || !url.startsWith(BUNDLE_PREFIX) || !url.endsWith('.zip')) return null;
  if (typeof sha256 !== 'string' || !isHash(sha256)) return null;
  return {
    version,
    url,
    sha256,
    apkMinima,
    ...(typeof huellaNativa === 'string' && isHash(huellaNativa) ? { huellaNativa } : {}),
    ...(isVersion(pr) ? { pr } : {}),
  };
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

// «Danzi Pruebas»: cada pull request abierto tiene su versión de prueba en Releases (pruebas-pr-<número>),
// con su APK de prueba, su parte web y su aviso. La publica .github/workflows/pruebas.yml.

/** Las versiones de Releases; las de prueba son preliminares con la etiqueta pruebas-pr-<número>. */
export const TEST_RELEASES_API = 'https://api.github.com/repos/alejo452/Danzi/releases?per_page=30';
export const testManifestUrl = (pr: number) => `${RELEASES}/download/pruebas-pr-${pr}/actualizacion.json`;
export const testApkUrl = (pr: number) => `${RELEASES}/download/pruebas-pr-${pr}/danzi-pruebas.apk`;

export type TestRelease = { pr: number; title: string };

/** Los pull requests con versión de prueba, del más nuevo al más viejo, a partir de la lista de Releases. */
export function parseTestReleases(data: unknown): TestRelease[] {
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(data)) return [];
  const byPr = new Map<number, TestRelease>();
  for (const r of data) {
    if (!r || typeof r !== 'object' || r.prerelease !== true || r.draft === true) continue;
    const m = typeof r.tag_name === 'string' ? r.tag_name.match(/^pruebas-pr-(\d+)$/) : null;
    if (!m) continue;
    const pr = Number(m[1]);
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    // pruebas.yml las titula «Danzi Pruebas · #16 · <título del pull request>».
    const title = name.replace(/^Danzi Pruebas · #\d+ · /, '') || `Pull request #${pr}`;
    if (!byPr.has(pr)) byPr.set(pr, { pr, title });
  }
  return [...byPr.values()].sort((a, b) => b.pr - a.pr);
}

/**
 * Qué hacer con la versión de prueba de un pull request.
 * @param webPr pull request de la versión que corre (__DANZI_PR__, 0 si no es de prueba).
 * @param pr pull request que se quiere probar.
 * @param apkHuella huella de la parte de Android de la APK instalada (undefined si no se sabe).
 */
export function decideTestUpdate(
  manifest: UpdateManifest,
  { webVersion, webPr, pr, apkHuella, failed }: { webVersion: number; webPr: number; pr: number; apkHuella?: string; failed: readonly number[] },
): UpdateDecision {
  if (pr === webPr && manifest.version <= webVersion) return { kind: 'al-dia' };
  if (!apkHuella || manifest.huellaNativa !== apkHuella) return { kind: 'necesita-apk', version: manifest.version };
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
  /** «Danzi Pruebas»: el pull request elegido para probar. */
  pr?: number;
  /** «Danzi Pruebas»: la huella de su APK, guardada al abrir la versión que trae la APK. */
  apk?: { version: number; huella: string };
};

export const UPDATE_STATE_KEY = 'actualizacion';

export function normalizeUpdateState(raw: unknown): UpdateState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const fallidas = Array.isArray(r.fallidas) ? r.fallidas.filter(isVersion).slice(-20) : [];
  const apk = (r.apk && typeof r.apk === 'object' ? r.apk : {}) as Record<string, unknown>;
  return {
    fallidas,
    ...(isVersion(r.vista) ? { vista: r.vista } : {}),
    ...(typeof r.revisada === 'number' && Number.isFinite(r.revisada) ? { revisada: r.revisada } : {}),
    ...(isVersion(r.pr) ? { pr: r.pr } : {}),
    ...(isVersion(apk.version) && typeof apk.huella === 'string' && isHash(apk.huella) ? { apk: { version: apk.version, huella: apk.huella } } : {}),
  };
}

export function addFailed(state: UpdateState, version: number): UpdateState {
  if (!isVersion(version) || state.fallidas.includes(version)) return state;
  return { ...state, fallidas: [...state.fallidas, version].slice(-20) };
}

/** Al volver a la app (sin cerrarla) se busca de nuevo, como mucho cada 6 horas. Al abrirla, siempre. */
export const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
/** «Danzi Pruebas» busca más seguido: mientras pruebas un pull request, cada cambio sale en pocos minutos. */
export const TEST_CHECK_EVERY_MS = 5 * 60 * 1000;

export function shouldCheck(lastCheck: number | undefined, now: number, every = CHECK_EVERY_MS): boolean {
  return lastCheck === undefined || now - lastCheck >= every || now < lastCheck;
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
