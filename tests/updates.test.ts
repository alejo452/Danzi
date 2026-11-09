import { describe, expect, it } from 'vitest';
import {
  APK_URL,
  CHECK_EVERY_MS,
  MANIFEST_URL,
  addFailed,
  decideUpdate,
  normalizeUpdateState,
  parseApkVersion,
  parseManifest,
  shouldCheck,
  versionLabel,
  type UpdateManifest,
} from '../src/lib/updates';

const sha = 'a'.repeat(64);
const manifest = (over: Partial<UpdateManifest> = {}): UpdateManifest => ({
  version: 130,
  url: 'https://github.com/alejo452/Danzi/releases/download/android-130/danzi-web.zip',
  sha256: sha,
  apkMinima: 120,
  ...over,
});

describe('aviso de versión nueva (actualizacion.json)', () => {
  it('lee un aviso válido, como objeto o como texto', () => {
    expect(parseManifest(manifest())).toEqual(manifest());
    expect(parseManifest(JSON.stringify({ ...manifest(), huellaNativa: 'x' }))).toEqual(manifest());
  });

  it('rechaza avisos incompletos o raros', () => {
    expect(parseManifest('no es json')).toBeNull();
    expect(parseManifest(null)).toBeNull();
    expect(parseManifest({ ...manifest(), version: '130' })).toBeNull();
    expect(parseManifest({ ...manifest(), version: 0 })).toBeNull();
    expect(parseManifest({ ...manifest(), apkMinima: 1.5 })).toBeNull();
    expect(parseManifest({ ...manifest(), apkMinima: 131 })).toBeNull();
    expect(parseManifest({ ...manifest(), sha256: 'A'.repeat(64) })).toBeNull();
    expect(parseManifest({ ...manifest(), sha256: 'abc' })).toBeNull();
  });

  it('solo acepta paquetes de las versiones publicadas en este repositorio', () => {
    expect(parseManifest({ ...manifest(), url: 'https://example.com/danzi-web.zip' })).toBeNull();
    expect(parseManifest({ ...manifest(), url: 'https://github.com/otro/Danzi/releases/download/android-130/danzi-web.zip' })).toBeNull();
    expect(parseManifest({ ...manifest(), url: 'http://github.com/alejo452/Danzi/releases/download/android-130/danzi-web.zip' })).toBeNull();
    expect(parseManifest({ ...manifest(), url: 'https://github.com/alejo452/Danzi/releases/download/android-130/danzi.apk' })).toBeNull();
  });

  it('busca en la última versión de Releases del repositorio', () => {
    expect(MANIFEST_URL).toBe('https://github.com/alejo452/Danzi/releases/latest/download/actualizacion.json');
    expect(APK_URL).toBe('https://github.com/alejo452/Danzi/releases/latest/download/danzi.apk');
  });
});

describe('qué hacer con la versión publicada', () => {
  it('no hace nada si ya tiene esa versión o una más nueva', () => {
    expect(decideUpdate(manifest(), 130, 130, [])).toEqual({ kind: 'al-dia' });
    expect(decideUpdate(manifest(), 131, 131, [])).toEqual({ kind: 'al-dia' });
  });

  it('descarga la versión nueva si sirve para la APK instalada', () => {
    expect(decideUpdate(manifest(), 125, 120, [])).toEqual({ kind: 'descargar', manifest: manifest() });
    expect(decideUpdate(manifest(), 125, 125, [])).toEqual({ kind: 'descargar', manifest: manifest() });
  });

  it('pide instalar la APK si la versión nueva necesita una parte de Android más reciente', () => {
    expect(decideUpdate(manifest(), 119, 119, [])).toEqual({ kind: 'necesita-apk', version: 130 });
  });

  it('no vuelve a descargar una versión que ya falló en este celular', () => {
    expect(decideUpdate(manifest(), 125, 125, [130])).toEqual({ kind: 'fallo-antes', version: 130 });
    expect(decideUpdate(manifest({ version: 131 }), 125, 125, [130])).toEqual({ kind: 'descargar', manifest: manifest({ version: 131 }) });
  });
});

describe('estado guardado en el dispositivo', () => {
  it('se recupera de datos vacíos o dañados', () => {
    expect(normalizeUpdateState(undefined)).toEqual({ fallidas: [] });
    expect(normalizeUpdateState({ fallidas: [3, 'x', -1, 4.5, 7], vista: 'no', revisada: Number.NaN })).toEqual({ fallidas: [3, 7] });
    expect(normalizeUpdateState({ fallidas: [], vista: 12, revisada: 1000 })).toEqual({ fallidas: [], vista: 12, revisada: 1000 });
  });

  it('guarda solo las últimas 20 versiones fallidas, sin repetir', () => {
    let s = normalizeUpdateState(undefined);
    for (let v = 1; v <= 25; v++) s = addFailed(s, v);
    s = addFailed(s, 25);
    expect(s.fallidas).toEqual(Array.from({ length: 20 }, (_, i) => i + 6));
    expect(addFailed(s, Number.NaN)).toBe(s);
  });

  it('al volver a la app busca como mucho cada 6 horas', () => {
    expect(shouldCheck(undefined, 1000)).toBe(true);
    expect(shouldCheck(1000, 1000 + CHECK_EVERY_MS - 1)).toBe(false);
    expect(shouldCheck(1000, 1000 + CHECK_EVERY_MS)).toBe(true);
    // Si el reloj del celular retrocedió, busca de nuevo.
    expect(shouldCheck(5000, 1000)).toBe(true);
  });
});

describe('versión de la APK instalada', () => {
  it('sale del versionName que pone el workflow', () => {
    expect(parseApkVersion('1.125')).toEqual({ apk: 125, pruebas: false });
    expect(parseApkVersion('1.125-pruebas')).toEqual({ apk: 125, pruebas: true });
  });

  it('las compilaciones locales no tienen número', () => {
    expect(parseApkVersion('dev')).toEqual({ apk: 0, pruebas: false });
    expect(parseApkVersion('dev-pruebas')).toEqual({ apk: 0, pruebas: true });
    expect(parseApkVersion('')).toEqual({ apk: 0, pruebas: false });
  });

  it('se muestra como en Releases', () => {
    expect(versionLabel(125)).toBe('1.125');
  });
});
