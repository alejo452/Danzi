// Leer un texto en chino (pegado o leído con la cámara): separarlo en palabras del temario HSK y decir qué es cada
// una. Funciones puras; la vista está en src/views/Reader.tsx.
//
// Para separar se usan las 11 000 palabras del temario (todas de 1 a 4 caracteres). Cada tramo de caracteres
// chinos se separa buscando la palabra más larga hacia adelante y también hacia atrás, y se elige la separación con
// menos palabras (si empatan, la que deja menos caracteres sueltos; si siguen empatadas, la de hacia atrás, que en
// chino suele acertar más). Es el método clásico de máxima coincidencia en los dos sentidos.
import type { Word } from '../data/levels';
import type { Progress } from './progress';
import { isLearning, isMature } from './srs';

/** Una fila del temario oficial (data-source/hsk-2025-syllabus.json). */
export type SyllabusRow = [id: number, level: string, hanzi: string, pinyin: string, pos: string];

export type Entry = {
  id: number;
  /** «1» a «6», o «7-9». */
  level: string;
  hanzi: string;
  pinyin: string;
  pos: string;
  /** Significado en español: solo las palabras de los niveles que ya están completos en Danzi. */
  es?: string;
};

export type Dictionary = { byHanzi: Map<string, Entry[]>; maxLen: number };

export type Token =
  /** Una palabra del temario. Puede tener varias lecturas (长 cháng y zhǎng). */
  | { kind: 'palabra'; text: string; entries: Entry[] }
  /** Un carácter chino que no forma ninguna palabra del temario. */
  | { kind: 'desconocida'; text: string }
  /** Puntuación, espacios, letras o números: se muestran tal cual. */
  | { kind: 'otro'; text: string };

const HAN = /\p{Script=Han}/u;

/** El diccionario para leer: el temario completo, con el significado de las palabras que ya están en Danzi. */
export function buildDictionary(rows: SyllabusRow[], words: Word[]): Dictionary {
  const meaning = new Map(words.map((w) => [w.id, w.es]));
  const byHanzi = new Map<string, Entry[]>();
  let maxLen = 1;
  for (const [id, level, hanzi, pinyin, pos] of rows) {
    const entry: Entry = { id, level, hanzi, pinyin, pos };
    const es = meaning.get(id);
    if (es) entry.es = es;
    const list = byHanzi.get(hanzi);
    if (list) list.push(entry);
    else byHanzi.set(hanzi, [entry]);
    maxLen = Math.max(maxLen, Array.from(hanzi).length);
  }
  return { byHanzi, maxLen };
}

/** Un pedazo de la separación: una palabra del temario o un carácter que no forma ninguna. */
type Chunk = { text: string; known: boolean };

function forward(chars: string[], dict: Dictionary): Chunk[] {
  const out: Chunk[] = [];
  for (let i = 0; i < chars.length; ) {
    let len = Math.min(dict.maxLen, chars.length - i);
    while (len > 1 && !dict.byHanzi.has(chars.slice(i, i + len).join(''))) len--;
    const text = chars.slice(i, i + len).join('');
    out.push({ text, known: dict.byHanzi.has(text) });
    i += len;
  }
  return out;
}

function backward(chars: string[], dict: Dictionary): Chunk[] {
  const out: Chunk[] = [];
  for (let j = chars.length; j > 0; ) {
    let len = Math.min(dict.maxLen, j);
    while (len > 1 && !dict.byHanzi.has(chars.slice(j - len, j).join(''))) len--;
    const text = chars.slice(j - len, j).join('');
    out.push({ text, known: dict.byHanzi.has(text) });
    j -= len;
  }
  return out.reverse();
}

/** Cuántos pedazos de un solo carácter tiene una separación (los desconocidos cuentan doble). */
function singles(chunks: Chunk[]): number {
  return chunks.reduce((n, p) => n + (Array.from(p.text).length === 1 ? (p.known ? 1 : 2) : 0), 0);
}

/** Separa un tramo de caracteres chinos en palabras del temario. */
function segmentHan(run: string, dict: Dictionary): Token[] {
  const chars = Array.from(run);
  const f = forward(chars, dict);
  const b = backward(chars, dict);
  const best = f.length !== b.length ? (f.length < b.length ? f : b) : singles(f) < singles(b) ? f : b;
  return best.map((p) => (p.known ? { kind: 'palabra', text: p.text, entries: dict.byHanzi.get(p.text)! } : { kind: 'desconocida', text: p.text }));
}

/** Separa un texto en palabras del temario, caracteres que no están en él y todo lo demás (que queda tal cual). */
export function segment(text: string, dict: Dictionary): Token[] {
  const out: Token[] = [];
  let run = '';
  let other = '';
  for (const ch of text) {
    if (HAN.test(ch)) {
      if (other) out.push({ kind: 'otro', text: other });
      other = '';
      run += ch;
    } else {
      if (run) out.push(...segmentHan(run, dict));
      run = '';
      other += ch;
    }
  }
  if (run) out.push(...segmentHan(run, dict));
  if (other) out.push({ kind: 'otro', text: other });
  return out;
}

/** Signos que no pueden empezar una línea: van pegados a la palabra de antes. */
const CLOSING = /^[，。、；：！？）」』》〉】〕”’…,.;:!?)\]]+/u;
/** Signos que no pueden terminar una línea: van pegados a la palabra de después. */
const OPENING = /[（「『《〈【〔“‘(\[]+$/u;

/**
 * Cómo se muestra el texto: cada palabra (o carácter suelto) con los signos que van pegados a ella, para que una línea
 * nunca empiece con «，» ni termine con «「». `index` es la posición del token en `tokens`.
 */
export type Piece =
  | { kind: 'palabra'; index: number; before: string; after: string }
  | { kind: 'texto'; index: number; text: string };

export function pieces(tokens: Token[]): Piece[] {
  const out: Piece[] = [];
  let before = '';
  tokens.forEach((t, index) => {
    if (t.kind !== 'otro') {
      out.push({ kind: 'palabra', index, before, after: '' });
      before = '';
      return;
    }
    let text = t.text;
    const prev = out[out.length - 1];
    const closing = prev?.kind === 'palabra' && prev.index === index - 1 ? text.match(CLOSING) : null;
    if (closing && prev?.kind === 'palabra') {
      prev.after = closing[0];
      text = text.slice(closing[0].length);
    }
    const opening = index < tokens.length - 1 ? text.match(OPENING) : null;
    if (opening) {
      before = opening[0];
      text = text.slice(0, -opening[0].length);
    }
    if (text) out.push({ kind: 'texto', index, text });
  });
  return out;
}

/** Si el texto tiene algún carácter chino. */
export function hasChinese(text: string): boolean {
  return HAN.test(text);
}

/** Cuánto conoce Diego una palabra, según su tarjeta de lectura. «fuera»: todavía no está en Danzi (HSK 7–9). */
export type Knowledge = 'dominada' | 'repaso' | 'aprendiendo' | 'nueva' | 'fuera';

export function knowledgeOf(entry: Entry, p: Progress): Knowledge {
  const card = p.decks.read[String(entry.id)];
  if (!card) return entry.es ? 'nueva' : 'fuera';
  if (isLearning(card)) return 'aprendiendo';
  return isMature(card) ? 'dominada' : 'repaso';
}

/** De varias lecturas de una misma palabra, la que mejor conoce. */
export function bestKnowledge(entries: Entry[], p: Progress): Knowledge {
  const order: Knowledge[] = ['dominada', 'repaso', 'aprendiendo', 'nueva', 'fuera'];
  return entries.map((e) => knowledgeOf(e, p)).sort((a, b) => order.indexOf(a) - order.indexOf(b))[0] ?? 'fuera';
}

/** Los mismos nombres de Palabras. Las de HSK 7–9 tampoco se han visto: la vista dice aparte que no están en Danzi. */
export const KNOWLEDGE_LABEL: Record<Knowledge, string> = {
  dominada: 'Dominada',
  repaso: 'En repaso',
  aprendiendo: 'Aprendiendo',
  nueva: 'Sin ver',
  fuera: 'Sin ver',
};

export type FoundWord = { text: string; entries: Entry[]; count: number };

/** Las palabras del temario que aparecen en el texto, una vez cada una, en el orden en que salen. */
export function foundWords(tokens: Token[]): FoundWord[] {
  const byText = new Map<string, FoundWord>();
  for (const t of tokens) {
    if (t.kind !== 'palabra') continue;
    const found = byText.get(t.text);
    if (found) found.count++;
    else byText.set(t.text, { text: t.text, entries: t.entries, count: 1 });
  }
  return [...byText.values()];
}

/** Cuántas palabras distintas hay de cada tipo, y cuántos caracteres no forman palabras del temario. */
export function readingSummary(tokens: Token[], p: Progress): Record<Knowledge, number> & { words: number; unknown: number } {
  const out = { words: 0, unknown: 0, dominada: 0, repaso: 0, aprendiendo: 0, nueva: 0, fuera: 0 };
  for (const w of foundWords(tokens)) {
    out.words++;
    out[bestKnowledge(w.entries, p)]++;
  }
  out.unknown = new Set(tokens.filter((t) => t.kind === 'desconocida').map((t) => t.text)).size;
  return out;
}
