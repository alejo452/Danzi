// Crea o actualiza el borrador de un nivel a partir del temario oficial.
//
//   npm run data:skeleton -- 2
//
// Escribe data-source/drafts/level-2.json con todas las palabras del nivel (id, hanzi, pinyin, pos)
// y campos vacíos para el significado en español y la frase de ejemplo. Si el borrador ya existe,
// conserva lo que ya está traducido. Cuando todas las entradas estén completas, mueve el archivo a
// src/data/hsk/level-2.json: a partir de ahí la app lo carga y las pruebas lo validan.
import fs from 'node:fs';
import path from 'node:path';

const level = process.argv[2];
if (!level) {
  console.error('Uso: npm run data:skeleton -- <nivel>   (1, 2, 3, 4, 5, 6 o 7-9)');
  process.exit(1);
}

const syllabus = JSON.parse(fs.readFileSync('data-source/hsk-2025-syllabus.json', 'utf8'));
const rows = syllabus.filter((r) => r[1] === level);
if (!rows.length) {
  console.error(`El temario no tiene el nivel "${level}".`);
  process.exit(1);
}

const draftPath = path.join('data-source', 'drafts', `level-${level}.json`);
const finalPath = path.join('src', 'data', 'hsk', `level-${level}.json`);
const existingPath = fs.existsSync(draftPath) ? draftPath : fs.existsSync(finalPath) ? finalPath : null;
const existing = new Map();
if (existingPath) for (const w of JSON.parse(fs.readFileSync(existingPath, 'utf8'))) existing.set(w.id, w);

const words = rows.map(([id, , hanzi, pinyin, pos]) => {
  const prev = existing.get(id);
  return {
    id,
    hanzi,
    pinyin,
    pos,
    es: prev?.es ?? '',
    ex: { zh: prev?.ex?.zh ?? '', py: prev?.ex?.py ?? '', es: prev?.ex?.es ?? '' },
  };
});

fs.mkdirSync(path.dirname(draftPath), { recursive: true });
fs.writeFileSync(draftPath, '[\n' + words.map((w) => '  ' + JSON.stringify(w)).join(',\n') + '\n]\n');

const pending = words.filter((w) => !w.es || !w.ex.zh || !w.ex.py || !w.ex.es).length;
console.log(`Nivel ${level}: ${words.length} palabras en ${draftPath}. Faltan por completar: ${pending}.`);
