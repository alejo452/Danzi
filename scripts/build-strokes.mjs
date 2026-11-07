// Copia a public/strokes/ los datos de trazos de cada carácter que aparece en el vocabulario.
// Se ejecuta solo antes de cada build (npm run build). Los archivos se nombran por su código Unicode
// en hexadecimal (家 → 5bb6.json) para evitar nombres de archivo con caracteres chinos.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const dataDir = path.dirname(require.resolve('hanzi-writer-data'));
const levelsDir = 'src/data/hsk';
const outDir = 'public/strokes';

fs.mkdirSync(outDir, { recursive: true });

const chars = new Set();
for (const file of fs.readdirSync(levelsDir).filter((f) => /^level-.+\.json$/.test(f))) {
  const words = JSON.parse(fs.readFileSync(path.join(levelsDir, file), 'utf8'));
  for (const w of words) for (const ch of w.hanzi) if (/\p{Script=Han}/u.test(ch)) chars.add(ch);
}

let written = 0;
const missing = [];
for (const ch of chars) {
  const src = path.join(dataDir, `${ch}.json`);
  if (!fs.existsSync(src)) {
    missing.push(ch);
    continue;
  }
  const d = JSON.parse(fs.readFileSync(src, 'utf8'));
  const name = ch.codePointAt(0).toString(16);
  fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify({ strokes: d.strokes, medians: d.medians, radStrokes: d.radStrokes }));
  written++;
}

console.log(`Trazos: ${written} caracteres copiados a ${outDir}.`);
if (missing.length) console.warn(`Sin datos de trazos para: ${missing.join(' ')}`);
