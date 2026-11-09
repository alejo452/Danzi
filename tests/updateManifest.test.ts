// El aviso de versión nueva que publica android.yml (scripts/update-manifest.mjs) tiene que poder leerlo la APK.
import { describe, expect, it } from 'vitest';
import { buildManifest, nativeFingerprint } from '../scripts/update-manifest.mjs';
import { decideUpdate, parseManifest } from '../src/lib/updates';

const zipSha256 = 'b'.repeat(64);
const fingerprint = nativeFingerprint();

describe('aviso de versión nueva para la APK', () => {
  it('la huella de la parte de Android es estable', () => {
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(nativeFingerprint()).toBe(fingerprint);
  });

  it('la APK lo entiende', () => {
    const m = buildManifest({ version: 140, zipSha256, fingerprint, previous: null });
    expect(parseManifest(JSON.stringify(m))).toEqual({
      version: 140,
      url: 'https://github.com/alejo452/Danzi/releases/download/android-140/danzi-web.zip',
      sha256: zipSha256,
      apkMinima: 140,
    });
  });

  it('si la parte de Android no cambió, las APK anteriores reciben la versión nueva', () => {
    const previous = buildManifest({ version: 140, zipSha256, fingerprint, previous: null });
    const m = buildManifest({ version: 141, zipSha256, fingerprint, previous });
    expect(m.apkMinima).toBe(140);
    expect(decideUpdate(parseManifest(m)!, 140, 140, [])).toEqual({ kind: 'descargar', manifest: parseManifest(m) });
  });

  it('si cambió, piden instalar la APK nueva', () => {
    const previous = buildManifest({ version: 140, zipSha256, fingerprint: 'c'.repeat(64), previous: null });
    const m = buildManifest({ version: 141, zipSha256, fingerprint, previous });
    expect(m.apkMinima).toBe(141);
    expect(decideUpdate(parseManifest(m)!, 140, 140, [])).toEqual({ kind: 'necesita-apk', version: 141 });
  });

  it('no confía en un aviso anterior raro', () => {
    for (const previous of [{}, { huellaNativa: fingerprint }, { huellaNativa: fingerprint, apkMinima: 150 }, { huellaNativa: fingerprint, apkMinima: '120' }]) {
      expect(buildManifest({ version: 141, zipSha256, fingerprint, previous }).apkMinima).toBe(141);
    }
  });

  it('rechaza datos inválidos', () => {
    expect(() => buildManifest({ version: 0, zipSha256, fingerprint, previous: null })).toThrow();
    expect(() => buildManifest({ version: 141, zipSha256: 'xyz', fingerprint, previous: null })).toThrow();
  });
});
