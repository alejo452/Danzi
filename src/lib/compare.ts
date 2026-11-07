// Compara lo que el reconocimiento de voz (o el dictado del teclado) entendió con la frase objetivo.
// Se compara por sílabas de pinyin, no por caracteres, para que palabras que suenan igual
// (他/她, 的/得) cuenten como bien dichas.
import { pinyin } from 'pinyin-pro';

export type SyllableResult = { ch: string; status: 'ok' | 'tone' | 'miss' | 'punct' };
export type Comparison = { parts: SyllableResult[]; score: number; heard: string };

const DIGITS: Record<string, string> = { '0': '零', '1': '一', '2': '二', '3': '三', '4': '四', '5': '五', '6': '六', '7': '七', '8': '八', '9': '九' };

/** Los reconocedores a veces devuelven cifras ("8点"). Las pasamos a caracteres. */
export function digitsToHanzi(s: string): string {
  return s.replace(/10/g, '十').replace(/[0-9]/g, (d) => DIGITS[d]);
}

type Syl = { ch: string; base: string; tone: number; isZh: boolean };

function stripTone(p: string): string {
  return p.normalize('NFD').replace(/[̀́̄̌]/g, '').normalize('NFC');
}

function syllables(text: string): Syl[] {
  return pinyin(text, { type: 'all' }).map((x) => ({
    ch: x.origin,
    base: stripTone(x.pinyin),
    tone: x.num,
    isZh: x.isZh,
  }));
}

/**
 * Caracteres que suelen llevar erhua (哪儿 nǎr, 一点儿 yìdiǎnr, 面条儿 miàntiáor, 男孩儿 nánháir).
 * En el resto (儿子, 女儿) 儿 es una sílaba propia.
 */
export const ERHUA_BEFORE = new Set(['哪', '这', '那', '点', '玩', '条', '会', '块', '边', '空', '事', '头', '孩']);

/** Une la "r" del erhua: 哪儿 → nar, para que "nǎ ér" y "nǎr" coincidan. */
function mergeErhua(list: Syl[]): Syl[] {
  const out: Syl[] = [];
  for (const s of list) {
    const prev = out[out.length - 1];
    if (s.isZh && s.ch === '儿' && prev?.isZh && ERHUA_BEFORE.has(Array.from(prev.ch).pop()!)) {
      out[out.length - 1] = { ...prev, ch: prev.ch + s.ch, base: prev.base + 'r' };
    } else out.push(s);
  }
  return out;
}

export function compareSpeech(target: string, heard: string): Comparison {
  const t = mergeErhua(syllables(target));
  const h = mergeErhua(syllables(digitsToHanzi(heard))).filter((s) => s.isZh);
  const a = t.filter((s) => s.isZh);
  const n = a.length;
  const m = h.length;
  // Subsecuencia común más larga sobre la sílaba sin tono.
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i].base === h[j].base ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const matched = new Map<number, number>();
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i].base === h[j].base) {
      matched.set(i, j);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  let k = 0;
  let good = 0;
  const parts: SyllableResult[] = t.map((s) => {
    if (!s.isZh) return { ch: s.ch, status: 'punct' };
    const idx = k++;
    const hj = matched.get(idx);
    if (hj === undefined) return { ch: s.ch, status: 'miss' };
    const ht = h[hj].tone;
    // El tono neutro (0) cambia según el contexto: no se cuenta como error.
    if (s.tone !== 0 && ht !== 0 && s.tone !== ht) return { ch: s.ch, status: 'tone' };
    good++;
    return { ch: s.ch, status: 'ok' };
  });
  return { parts, score: n ? good / n : 0, heard };
}
