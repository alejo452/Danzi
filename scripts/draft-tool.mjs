// Ayuda para completar un borrador de nivel (data-source/drafts/level-<nivel>.json) por lotes.
//
//   node scripts/draft-tool.mjs estado
//       Cuántas palabras faltan en cada borrador.
//   node scripts/draft-tool.mjs siguientes <nivel> [cantidad=50]
//       Las siguientes palabras sin completar: id, hanzi, pinyin y categoría, separados por tabuladores.
//   node scripts/draft-tool.mjs aplicar <nivel> <archivo>
//       Copia al borrador un lote escrito en <archivo>, una palabra por línea y los campos separados por
//       tabuladores: id, significado, frase en chino, pinyin de la frase, traducción de la frase.
//       Las líneas vacías y las que empiezan por # se ignoran.
//
// Después de aplicar un lote, npm test revisa las entradas completadas (tests/drafts.test.ts).
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.join('data-source', 'drafts');
const draftPath = (level) => path.join(DIR, `level-${level}.json`);
const pending = (w) => !w.es || !w.ex.zh || !w.ex.py || !w.ex.es;

function load(level) {
  const file = draftPath(level);
  if (!fs.existsSync(file)) throw new Error(`No existe ${file}. Créalo con npm run data:skeleton -- ${level}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function save(level, words) {
  fs.writeFileSync(draftPath(level), '[\n' + words.map((w) => '  ' + JSON.stringify(w)).join(',\n') + '\n]\n');
}

const [cmd, level, arg] = process.argv.slice(2);
try {
  if (cmd === 'estado') {
    const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => /^level-.+\.json$/.test(f)) : [];
    if (!files.length) console.log('No hay borradores.');
    for (const f of files) {
      const words = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
      const left = words.filter(pending).length;
      console.log(`${f}: ${words.length - left} de ${words.length} completadas, faltan ${left}.`);
    }
  } else if (cmd === 'siguientes' && level) {
    const n = Number(arg ?? 50);
    for (const w of load(level).filter(pending).slice(0, n)) console.log([w.id, w.hanzi, w.pinyin, w.pos].join('\t'));
  } else if (cmd === 'aplicar' && level && arg) {
    const words = load(level);
    const byId = new Map(words.map((w) => [w.id, w]));
    let count = 0;
    for (const [i, line] of fs.readFileSync(arg, 'utf8').split('\n').entries()) {
      if (!line.trim() || line.startsWith('#')) continue;
      const parts = line.split('\t').map((s) => s.trim());
      if (parts.length !== 5) throw new Error(`Línea ${i + 1}: tiene ${parts.length} campos y deben ser 5.`);
      const [id, es, zh, py, exEs] = parts;
      const w = byId.get(Number(id));
      if (!w) throw new Error(`Línea ${i + 1}: el id ${id} no es del nivel ${level}.`);
      if (!zh.includes(w.hanzi)) throw new Error(`Línea ${i + 1}: la frase no usa ${w.hanzi}.`);
      Object.assign(w, { es, ex: { zh, py, es: exEs } });
      count++;
    }
    save(level, words);
    console.log(`Aplicadas ${count} palabras. Faltan ${words.filter(pending).length} de ${words.length}.`);
  } else {
    throw new Error('Uso: node scripts/draft-tool.mjs estado | siguientes <nivel> [cantidad] | aplicar <nivel> <archivo>');
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
