// Ejercicio de tonos: escuchar una palabra y elegir el pinyin con los tonos correctos.
import type { Word } from '../data/levels';

const TONES: Record<string, string> = { a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', ü: 'ǖǘǚǜ' };
const MARKED: Record<string, [string, number]> = {};
for (const [base, marks] of Object.entries(TONES)) Array.from(marks).forEach((ch, i) => (MARKED[ch] = [base, i + 1]));

/** Palabras que la voz del dispositivo puede leer con otra pronunciación válida fuera de contexto. */
const AMBIGUOUS = new Set(['都', '那', '哪', '一', '谁', '还', '只', '分', '对', '和', '了', '的', '得', '着', '地', '行', '长', '少', '要', '为', '觉', '便']);

export function markPositions(py: string): number[] {
  const out: number[] = [];
  Array.from(py).forEach((ch, i) => {
    if (MARKED[ch]) out.push(i);
  });
  return out;
}

function setTone(py: string, pos: number, tone: number): string {
  const a = Array.from(py);
  a[pos] = TONES[MARKED[a[pos]][0]][tone - 1];
  return a.join('');
}

/**
 * Sirve para el ejercicio si tiene tonos marcados, una sola lectura y no tiene dos terceros tonos
 * seguidos (se pronuncian distinto de como se escriben, 水果 suena shuíguǒ).
 */
export function eligibleForTones(w: Word): boolean {
  if (AMBIGUOUS.has(w.hanzi) || w.pinyin.includes('/')) return false;
  const a = Array.from(w.pinyin);
  const marks = markPositions(w.pinyin);
  if (!marks.length) return false;
  return marks.filter((p) => MARKED[a[p]][1] === 3).length < 2;
}

function otherTone(current: number, rnd: () => number): number {
  let t = current;
  while (t === current) t = 1 + Math.floor(rnd() * 4);
  return t;
}

export function shuffle<T>(list: T[], rnd: () => number = Math.random): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Cuatro opciones distintas: la correcta y tres con algún tono cambiado. */
export function toneOptions(py: string, rnd: () => number = Math.random): string[] {
  const a = Array.from(py);
  const marks = markPositions(py);
  const set = [py];
  let guard = 0;
  while (set.length < 4 && guard < 200) {
    guard++;
    const p = marks[Math.floor(rnd() * marks.length)];
    let v = setTone(py, p, otherTone(MARKED[a[p]][1], rnd));
    if (marks.length > 1 && rnd() < 0.4) {
      const p2 = marks.find((x) => x !== p)!;
      v = setTone(v, p2, otherTone(MARKED[a[p2]][1], rnd));
    }
    if (!set.includes(v)) set.push(v);
  }
  return shuffle(set, rnd);
}
