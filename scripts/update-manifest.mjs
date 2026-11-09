// Crea actualizacion.json, el aviso de versión nueva para la actualización automática de la APK
// (src/lib/updates.ts). android.yml lo publica en Releases junto a danzi.apk y danzi-web.zip.
//
//   node scripts/update-manifest.mjs <versión> <zip> [aviso anterior]
//
// - version: el número de ejecución del workflow. La APK de esa ejecución es la 1.<versión>.
// - url: el zip de dist/ en la versión de Releases android-<versión>.
// - sha256: del zip. La APK no usa el paquete si no coincide.
// - huellaNativa: SHA-256 de lo que va en la parte de Android (nativeFingerprint).
// - apkMinima: si la huella es la misma del aviso anterior, se queda igual; si cambió, es esta versión.
//   Las APK anteriores no tienen el código nativo nuevo: en vez de descargar la parte web, Ajustes les pide
//   instalar la APK.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RELEASES = 'https://github.com/alejo452/Danzi/releases';

/**
 * Huella de la parte de Android: los archivos de android/ y capacitor.config.ts tal como están en el commit
 * (git ls-tree da el hash de cada uno) y las versiones instaladas de los complementos de Capacitor.
 * Si nada de eso cambia, una APK anterior puede usar la parte web nueva.
 */
export function nativeFingerprint(root = '.') {
  const tree = execFileSync('git', ['ls-tree', '-r', 'HEAD', '--', 'android', 'capacitor.config.ts'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .sort();
  if (!tree.length) throw new Error('No se encontraron los archivos de android/ en el commit.');
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const plugins = Object.entries(lock.packages ?? {})
    .filter(([p]) => /^node_modules\/@(capacitor|capacitor-community|capgo)\/[^/]+$/.test(p))
    .map(([p, info]) => `${p.slice('node_modules/'.length)}@${info.version}`)
    .sort();
  return crypto.createHash('sha256').update([...tree, ...plugins].join('\n')).digest('hex');
}

/** El aviso de esta versión. `previous` es el aviso de la versión publicada antes (o null). */
export function buildManifest({ version, zipSha256, fingerprint, previous }) {
  if (!Number.isInteger(version) || version <= 0) throw new Error(`Versión inválida: ${version}`);
  if (!/^[0-9a-f]{64}$/.test(zipSha256)) throw new Error('El SHA-256 del zip no es válido.');
  const keep =
    previous?.huellaNativa === fingerprint && Number.isInteger(previous?.apkMinima) && previous.apkMinima > 0 && previous.apkMinima <= version;
  return {
    version,
    url: `${RELEASES}/download/android-${version}/danzi-web.zip`,
    sha256: zipSha256,
    apkMinima: keep ? previous.apkMinima : version,
    huellaNativa: fingerprint,
  };
}

function readPrevious(file) {
  if (!file || !fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [versionArg, zip, previousFile] = process.argv.slice(2);
  if (!versionArg || !zip) {
    console.error('Uso: node scripts/update-manifest.mjs <versión> <zip> [aviso anterior]');
    process.exit(1);
  }
  const zipSha256 = crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
  const previous = readPrevious(previousFile);
  const manifest = buildManifest({ version: Number(versionArg), zipSha256, fingerprint: nativeFingerprint(), previous });
  console.error(
    previous
      ? manifest.apkMinima === previous.apkMinima
        ? `La parte de Android no cambió: las APK desde la 1.${manifest.apkMinima} reciben esta versión sin reinstalar.`
        : 'La parte de Android cambió: hay que instalar la APK nueva para recibir esta versión.'
      : 'No hay aviso anterior: esta es la primera versión con actualización automática.',
  );
  process.stdout.write(JSON.stringify(manifest, null, 2) + '\n');
}
