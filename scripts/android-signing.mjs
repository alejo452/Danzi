// Llave de firma de la APK de Android.
//
// Todas las versiones de la APK van firmadas con la misma llave. Si cambia, Android no deja instalar
// la versión nueva encima de la anterior, y desinstalar la app borra el progreso. La llave vive en el
// secreto DANZI_FIRMA_ANDROID de GitHub y en una copia que guarda el dueño. Nunca la imprimas ni la
// guardes en el repositorio. Su huella (pública) está en android/firma-sha256.txt.
//
// El código del secreto es «danzifirma1.» + base64url(JSON { keystore, password }), con la llave en
// formato PKCS12 y en base64. android/app/build.gradle lo lee directamente de DANZI_FIRMA_ANDROID.
//
// Usos:
//   node scripts/android-signing.mjs crear <archivo>   Crea una llave nueva y escribe el código en <archivo>
//                                                       (fuera del repositorio). Se hace una sola vez.
//   node scripts/android-signing.mjs huella            Con DANZI_FIRMA_ANDROID definido, imprime la huella
//                                                       SHA-256 del certificado (es pública).
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SIGNING_PREFIX = 'danzifirma1.';
export const KEY_ALIAS = 'danzi';

/** @param {{ keystore: Buffer, password: string }} key */
export function encodeSigningCode({ keystore, password }) {
  return SIGNING_PREFIX + Buffer.from(JSON.stringify({ keystore: keystore.toString('base64'), password })).toString('base64url');
}

/** @returns {{ keystore: Buffer, password: string }} */
export function decodeSigningCode(text) {
  const t = String(text ?? '').trim();
  if (!t.startsWith(SIGNING_PREFIX)) throw new Error(`El código no empieza por ${SIGNING_PREFIX}`);
  let data;
  try {
    data = JSON.parse(Buffer.from(t.slice(SIGNING_PREFIX.length), 'base64url').toString('utf8'));
  } catch {
    throw new Error('El código está incompleto o tiene caracteres de más.');
  }
  if (!data || typeof data.keystore !== 'string' || !data.keystore || typeof data.password !== 'string' || !data.password) {
    throw new Error('Al código le faltan datos.');
  }
  return { keystore: Buffer.from(data.keystore, 'base64'), password: data.password };
}

/** Huella SHA-256 del certificado, en hexadecimal sin dos puntos (como la imprime apksigner). */
function fingerprint(file, password) {
  const out = execFileSync('keytool', ['-list', '-v', '-keystore', file, '-storetype', 'PKCS12', '-storepass:env', 'DANZI_PW'], {
    env: { ...process.env, DANZI_PW: password },
    encoding: 'utf8',
  });
  const m = out.match(/SHA256:\s*([0-9A-F:]+)/i);
  if (!m) throw new Error('No se encontró la huella del certificado.');
  return m[1].replace(/:/g, '').toLowerCase();
}

function withTempKeystore(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'danzi-firma-'));
  try {
    return fn(path.join(dir, 'danzi.p12'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function crear(outFile) {
  if (!outFile) throw new Error('Indica el archivo donde guardar el código: node scripts/android-signing.mjs crear <archivo>');
  if (fs.existsSync(outFile)) throw new Error(`${outFile} ya existe. No se sobrescribe una llave.`);
  const password = crypto.randomBytes(24).toString('base64url');
  const sha = withTempKeystore((file) => {
    execFileSync(
      'keytool',
      ['-genkeypair', '-keystore', file, '-storetype', 'PKCS12', '-alias', KEY_ALIAS, '-keyalg', 'RSA', '-keysize', '4096',
        '-validity', '36500', '-dname', 'CN=Danzi', '-storepass:env', 'DANZI_PW', '-keypass:env', 'DANZI_PW'],
      { env: { ...process.env, DANZI_PW: password }, stdio: 'ignore' },
    );
    fs.writeFileSync(outFile, encodeSigningCode({ keystore: fs.readFileSync(file), password }) + '\n', { mode: 0o600 });
    return fingerprint(file, password);
  });
  console.log(`Código guardado en ${outFile}. Huella SHA-256 del certificado (pública): ${sha}`);
}

function huella() {
  const { keystore, password } = decodeSigningCode(process.env.DANZI_FIRMA_ANDROID);
  console.log(withTempKeystore((file) => {
    fs.writeFileSync(file, keystore, { mode: 0o600 });
    return fingerprint(file, password);
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [cmd, arg] = process.argv.slice(2);
    if (cmd === 'crear') crear(arg);
    else if (cmd === 'huella') huella();
    else throw new Error('Uso: node scripts/android-signing.mjs crear <archivo> | huella');
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
