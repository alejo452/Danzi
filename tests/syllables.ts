// Funciones compartidas por las pruebas de datos (tests/data.test.ts y tests/drafts.test.ts):
// tipos de las palabras y comparación del pinyin de las frases de ejemplo.
import { pinyin } from 'pinyin-pro';
import { isErhua } from '../src/lib/compare';

export type Word = { id: number; hanzi: string; pinyin: string; pos: string; es: string; ex: { zh: string; py: string; es: string } };
export type Row = [number, string, string, string, string];

export const isHan = (ch: string) => /\p{Script=Han}/u.test(ch);

/** Letras del pinyin sin tonos ni signos, para comparar sílabas. */
export function letters(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * Lecturas correctas que pinyin-pro no reconoce: siempre da la otra.
 * - 地 como partícula se lee de (慢慢地 mànmàn de); pinyin-pro da dì.
 * - 得 como «tener que» se lee děi (我得走了 wǒ děi zǒu le); pinyin-pro da dé.
 * - 还 como «devolver» se lee huán (还书 huán shū); pinyin-pro da hái.
 * - 重 como «de nuevo» se lee chóng (重写 chóngxiě); pinyin-pro da zhòng.
 */
export const ALSO_READ: Record<string, string[]> = { 地: ['de'], 得: ['dei'], 还: ['huan'], 重: ['chong'] };

/** Pinyin automático de una frase, con erhua unido (哪儿 → nar) y 谁 como shei. Cada elemento es una sílaba o un grupo de opciones. */
export function autoSyllables(zh: string): string[][] {
  const out: string[][] = [];
  const all = pinyin(zh, { type: 'all' });
  let prev = '';
  for (const [i, x] of all.entries()) {
    if (!x.isZh) {
      prev = '';
      continue;
    }
    const next = all[i + 1]?.isZh ? all[i + 1].origin : '';
    const erhua = isErhua(prev, x.origin, next);
    prev = x.origin;
    if (erhua && out.length) {
      out[out.length - 1] = out[out.length - 1].map((s) => s + 'r');
      continue;
    }
    out.push([x.origin === '谁' ? 'shei' : letters(x.pinyin), ...(ALSO_READ[x.origin] ?? [])]);
  }
  return out;
}

/** Patrón con las sílabas esperadas, sin tonos ni espacios: 慢慢地 → ^manman(?:di|de)$. */
export function syllablePattern(zh: string): RegExp {
  return new RegExp('^' + autoSyllables(zh).map((o) => (o.length > 1 ? `(?:${o.join('|')})` : o[0])).join('') + '$');
}
