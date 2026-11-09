// Escritura en papel (#papel, solo en la APK): Danzi pide una palabra que ya estudias, la escribes a mano en un papel
// y le tomas una foto; ML Kit la lee en el mismo celular. Funciones puras; la vista está en src/views/Paper.tsx, la
// cámara en src/native/ocr.ts y las monedas en recordPaper (src/lib/progress.ts).
//
// Para que no se puedan sacar monedas con fotos de textos de internet: la palabra la elige Danzi, la foto sale de la
// cámara (no de la galería), no puede tener mucho texto y las monedas tienen tope diario (EARN.paperCap).
import type { Word } from '../data/levels';
import type { Progress } from './progress';

const HAN = /\p{Script=Han}/gu;

/** Los caracteres chinos de un texto, sin espacios, signos, letras ni saltos de línea. */
export function hanOnly(text: string): string {
  return (text.match(HAN) ?? []).join('');
}

/** Con menos palabras que estas en Escribir, se escoge entre todas las que ya viste en Repasar. */
const MIN_WRITTEN = 5;

/** Palabras para escribir en papel: las que ya practicas en Escribir o, si todavía son pocas, las que ya viste en Repasar. */
export function paperPool(p: Progress, words: Word[]): Word[] {
  const written = words.filter((w) => p.decks.write[String(w.id)]);
  return written.length >= MIN_WRITTEN ? written : words.filter((w) => p.decks.read[String(w.id)]);
}

/** La siguiente palabra, al azar y sin repetir las últimas que salieron (`recent`), si hay de dónde escoger. */
export function pickPaperWord(pool: Word[], recent: number[], random: () => number = Math.random): Word | null {
  const fresh = pool.filter((w) => !recent.includes(w.id));
  const from = fresh.length ? fresh : pool;
  return from.length ? from[Math.min(from.length - 1, Math.floor(random() * from.length))] : null;
}

/** Cuántos caracteres chinos puede tener la foto: la palabra escrita unas tres veces (al menos 8). Más es una página. */
export function maxPaperChars(word: string): number {
  return Math.max(8, 3 * Array.from(word).length);
}

export type PaperCheck =
  | { ok: true }
  /** No se leyó ningún carácter chino. */
  | { ok: false; reason: 'vacia' }
  /** Hay demasiado texto: no parece una palabra escrita a mano. */
  | { ok: false; reason: 'mucho'; read: string }
  /** Se leyó otra cosa. */
  | { ok: false; reason: 'otra'; read: string };

/** Si en lo que leyó la cámara está la palabra pedida. */
export function checkPaper(word: string, ocr: string): PaperCheck {
  const read = hanOnly(ocr);
  if (!read) return { ok: false, reason: 'vacia' };
  if (Array.from(read).length > maxPaperChars(word)) return { ok: false, reason: 'mucho', read };
  return read.includes(word) ? { ok: true } : { ok: false, reason: 'otra', read };
}
