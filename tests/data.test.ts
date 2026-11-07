// Valida cada nivel publicado en src/data/hsk/ contra el temario oficial.
// Un nivel solo puede estar en src/data/hsk/ si pasa todas estas pruebas.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pinyin } from 'pinyin-pro';
import { describe, expect, it } from 'vitest';
import { ERHUA_BEFORE } from '../src/lib/compare';

type Word = { id: number; hanzi: string; pinyin: string; pos: string; es: string; ex: { zh: string; py: string; es: string } };
type Row = [number, string, string, string, string];

const syllabus: Row[] = JSON.parse(fs.readFileSync('data-source/hsk-2025-syllabus.json', 'utf8'));
const byId = new Map(syllabus.map((r) => [r[0], r]));
const dir = 'src/data/hsk';
const strokesDir = path.dirname(createRequire(import.meta.url).resolve('hanzi-writer-data'));
const files = fs.readdirSync(dir).filter((f) => /^level-.+\.json$/.test(f));

/** Letras del pinyin sin tonos ni signos, para comparar sílabas. */
function letters(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * Lecturas que pinyin-pro no reconoce y que también son correctas.
 * 地 como partícula se lee de (慢慢地 mànmàn de), pero pinyin-pro siempre da dì.
 */
const ALSO_READ: Record<string, string[]> = { 地: ['de'] };

/** Pinyin automático de una frase, con erhua unido (哪儿 → nar) y 谁 como shei. Cada elemento es una sílaba o un grupo de opciones. */
function autoSyllables(zh: string): string[][] {
  const out: string[][] = [];
  let prev = '';
  for (const x of pinyin(zh, { type: 'all' })) {
    if (!x.isZh) {
      prev = '';
      continue;
    }
    const isErhua = x.origin === '儿' && ERHUA_BEFORE.has(prev);
    prev = x.origin;
    if (isErhua && out.length) {
      out[out.length - 1] = out[out.length - 1].map((s) => s + 'r');
      continue;
    }
    out.push([x.origin === '谁' ? 'shei' : letters(x.pinyin), ...(ALSO_READ[x.origin] ?? [])]);
  }
  return out;
}

/** Patrón con las sílabas esperadas, sin tonos ni espacios: 慢慢地 → ^manman(?:di|de)$. */
function syllablePattern(zh: string): RegExp {
  return new RegExp('^' + autoSyllables(zh).map((o) => (o.length > 1 ? `(?:${o.join('|')})` : o[0])).join('') + '$');
}

describe('temario', () => {
  it('tiene las 11 000 palabras con los totales por nivel del 《HSK考试大纲》 2025', () => {
    expect(syllabus.length).toBe(11000);
    const count = (lv: string) => syllabus.filter((r) => r[1] === lv).length;
    expect([count('1'), count('2'), count('3'), count('4'), count('5'), count('6'), count('7-9')]).toEqual([300, 200, 500, 1000, 1600, 1800, 5600]);
  });
});

const seenIds = new Set<number>();

for (const file of files) {
  const level = file.replace(/^level-|\.json$/g, '');
  const words: Word[] = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));

  describe(`nivel ${level}`, () => {
    it('incluye exactamente las palabras del temario para ese nivel', () => {
      const expected = syllabus.filter((r) => r[1] === level).map((r) => r[0]).sort((a, b) => a - b);
      expect(words.map((w) => w.id).sort((a, b) => a - b)).toEqual(expected);
    });

    it('no repite ids entre niveles', () => {
      for (const w of words) {
        expect(seenIds.has(w.id), `id ${w.id} repetido`).toBe(false);
        seenIds.add(w.id);
      }
    });

    it('conserva hanzi, pinyin y categoría del temario', () => {
      for (const w of words) {
        const r = byId.get(w.id)!;
        expect([w.hanzi, w.pinyin, w.pos], `id ${w.id}`).toEqual([r[2], r[3], r[4]]);
      }
    });

    it('tiene significado y ejemplo completos en cada palabra', () => {
      for (const w of words) {
        expect(w.es.trim(), `significado vacío en ${w.hanzi}`).not.toBe('');
        expect(w.ex.zh.trim() && w.ex.py.trim() && w.ex.es.trim(), `ejemplo incompleto en ${w.hanzi}`).toBeTruthy();
      }
    });

    it('usa la palabra en su propia frase de ejemplo', () => {
      for (const w of words) expect(w.ex.zh, `${w.hanzi} no aparece en su ejemplo`).toContain(w.hanzi);
    });

    it('escribe el pinyin del ejemplo con las sílabas correctas', () => {
      for (const w of words) {
        expect(letters(w.ex.py.replace(/'/g, '')), `pinyin del ejemplo de ${w.hanzi}: ${w.ex.zh}`).toMatch(syllablePattern(w.ex.zh));
      }
    });

    it('tiene trazos para escribir cada carácter', () => {
      for (const w of words)
        for (const ch of w.hanzi)
          if (/\p{Script=Han}/u.test(ch)) expect(fs.existsSync(path.join(strokesDir, `${ch}.json`)), `sin trazos para ${ch} (${w.hanzi})`).toBe(true);
    });
  });
}
