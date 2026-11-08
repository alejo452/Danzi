// Borradores de niveles en preparación (data-source/drafts/). Revisa las entradas ya completadas con las
// mismas reglas que los niveles publicados, y además que la frase de ejemplo solo use caracteres de
// palabras del mismo nivel o de niveles anteriores. Así cada lote se revisa al hacer commit, y el nivel
// llega completo y limpio a src/data/hsk/.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/data/levelList';
import { isHan, letters, syllablePattern, type Row, type Word } from './syllables';

const syllabus: Row[] = JSON.parse(fs.readFileSync('data-source/hsk-2025-syllabus.json', 'utf8'));
const strokesDir = path.dirname(createRequire(import.meta.url).resolve('hanzi-writer-data'));
const dir = 'data-source/drafts';
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^level-.+\.json$/.test(f)) : [];

/**
 * Caracteres de nombres propios que se pueden usar aunque no estén en el vocabulario hasta ese nivel:
 * 哥伦比亚 (Colombia), 波哥大 (Bogotá), 麦德林 (Medellín), 卡塔赫纳 (Cartagena) y 巴兰基亚 (Barranquilla).
 * Agrega aquí solo caracteres de nombres propios.
 */
const PROPER_NAME_CHARS = new Set([...'哥伦比亚波麦德林卡塔赫纳巴兰基']);

/** Caracteres de las palabras del temario hasta ese nivel, incluido. */
function charsUpTo(level: string): Set<string> {
  const upTo = LEVELS.slice(0, LEVELS.findIndex((l) => l.id === level) + 1).map((l) => l.id);
  return new Set(syllabus.filter((r) => upTo.includes(r[1])).flatMap((r) => [...r[2]].filter(isHan)));
}

describe('borradores de niveles', () => {
  it('están en data-source/drafts/ (puede no haber ninguno)', () => {
    expect(Array.isArray(files)).toBe(true);
  });
});

for (const file of files) {
  const level = file.replace(/^level-|\.json$/g, '');
  const words: Word[] = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  const done = words.filter((w) => w.es.trim() || w.ex.zh.trim() || w.ex.py.trim() || w.ex.es.trim());

  describe(`borrador del nivel ${level} (${done.length} de ${words.length} completadas)`, () => {
    it('tiene exactamente las palabras del temario, con hanzi, pinyin y categoría sin cambios', () => {
      const rows = syllabus.filter((r) => r[1] === level);
      expect(words.map((w) => [w.id, w.hanzi, w.pinyin, w.pos])).toEqual(rows.map((r) => [r[0], r[2], r[3], r[4]]));
    });

    it('las entradas empezadas tienen significado y ejemplo completos', () => {
      for (const w of done) {
        expect(w.es.trim(), `significado vacío en ${w.id} ${w.hanzi}`).not.toBe('');
        expect(w.ex.zh.trim() && w.ex.py.trim() && w.ex.es.trim(), `ejemplo incompleto en ${w.id} ${w.hanzi}`).toBeTruthy();
      }
    });

    it('cada ejemplo usa su palabra', () => {
      for (const w of done) expect(w.ex.zh, `${w.id} ${w.hanzi} no aparece en su ejemplo`).toContain(w.hanzi);
    });

    it('el pinyin de cada ejemplo tiene las sílabas correctas', () => {
      for (const w of done) {
        expect(letters(w.ex.py.replace(/'/g, '')), `pinyin del ejemplo de ${w.id} ${w.hanzi}: ${w.ex.zh}`).toMatch(syllablePattern(w.ex.zh));
      }
    });

    it('los ejemplos solo usan caracteres del nivel o de niveles anteriores', () => {
      const allowed = charsUpTo(level);
      const bad = done.flatMap((w) => [...w.ex.zh].filter((c) => isHan(c) && !allowed.has(c) && !PROPER_NAME_CHARS.has(c)).map((c) => `${w.id} ${w.hanzi}: ${c}`));
      expect(bad, 'caracteres fuera del vocabulario hasta este nivel').toEqual([]);
    });

    it('todos sus caracteres tienen trazos para escribirlos', () => {
      for (const w of words)
        for (const ch of w.hanzi) if (isHan(ch)) expect(fs.existsSync(path.join(strokesDir, `${ch}.json`)), `sin trazos para ${ch} (${w.hanzi})`).toBe(true);
    });
  });
}
