// Llave de firma de la APK: el código del secreto DANZI_FIRMA_ANDROID y cómo lo lee Gradle.
// (La llave real nunca está en el repositorio: aquí se usan datos inventados.)
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KEY_ALIAS, SIGNING_PREFIX, decodeSigningCode, encodeSigningCode } from '../scripts/android-signing.mjs';

describe('código de la llave de firma', () => {
  const key = { keystore: Buffer.from([0x30, 0x82, 0x01, 0x00, 0xff, 0x10]), password: 'clave-de-prueba_123' };

  it('va y vuelve sin cambios', () => {
    const code = encodeSigningCode(key);
    expect(code.startsWith(SIGNING_PREFIX)).toBe(true);
    // Un solo renglón, sin caracteres que se dañen al pegarlo en GitHub.
    expect(code).toMatch(/^danzifirma1\.[A-Za-z0-9_-]+$/);
    const back = decodeSigningCode(`  ${code}\n`);
    expect(back.password).toBe(key.password);
    expect(back.keystore.equals(key.keystore)).toBe(true);
  });

  it('explica qué falla con un código equivocado', () => {
    expect(() => decodeSigningCode(undefined)).toThrow('El código no empieza por danzifirma1.');
    expect(() => decodeSigningCode('danzi1.abc')).toThrow('no empieza por danzifirma1.');
    expect(() => decodeSigningCode('danzifirma1.%%%')).toThrow('incompleto');
    expect(() => decodeSigningCode(SIGNING_PREFIX + Buffer.from('{"password":"x"}').toString('base64url'))).toThrow('faltan datos');
  });

  it('Gradle lee el mismo formato y el mismo alias', () => {
    const gradle = fs.readFileSync('android/app/build.gradle', 'utf8');
    expect(gradle).toContain(`'${SIGNING_PREFIX}'`);
    expect(gradle).toContain("System.getenv('DANZI_FIRMA_ANDROID')");
    expect(gradle).toContain(`keyAlias '${KEY_ALIAS}'`);
  });

  it('la huella de la llave de siempre está en el repositorio', () => {
    expect(fs.readFileSync('android/firma-sha256.txt', 'utf8').trim()).toMatch(/^[0-9a-f]{64}$/);
  });
});
