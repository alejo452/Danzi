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
 * - 长 como «crecer, tener aspecto» se lee zhǎng (长得很像 zhǎng de hěn xiàng); pinyin-pro a veces da cháng.
 * - 咳 como «toser» se lee ké (咳个不停 ké ge bù tíng); pinyin-pro da la interjección hāi.
 * - 血 suelto, en el habla, se lee xiě (手上有血 shǒu shang yǒu xiě); pinyin-pro da xuè.
 * - 着 como «lograr» se lee zháo (睡不着 shuì bu zháo); pinyin-pro da zhe.
 * - 系 como «abrochar, amarrar» se lee jì (系安全带 jì ānquándài); pinyin-pro da xì.
 * - 调 como «trasladar» se lee diào (调到麦德林 diào dào Màidélín); pinyin-pro da tiáo.
 * - 似 en 类似 se lee sì (类似的问题 lèisì de wèntí); delante de 的, pinyin-pro da shì, como en 似的.
 */
export const ALSO_READ: Record<string, string[]> = {
  地: ['de'],
  得: ['dei'],
  还: ['huan'],
  重: ['chong'],
  长: ['zhang'],
  咳: ['ke'],
  血: ['xie'],
  着: ['zhao'],
  系: ['ji'],
  调: ['diao'],
  似: ['si'],
};

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
