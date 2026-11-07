// Datos de trazos para la escritura. scripts/build-strokes.mjs los copia a public/strokes/ en cada build,
// y el service worker los descarga todos al instalar la app, así que la escritura funciona sin internet.
import type { CharDataLoaderFn, CharacterJson } from 'hanzi-writer';
import type { Word } from '../data/levels';

/** Dirección del archivo de trazos de un carácter: 家 → strokes/5bb6.json. */
export function strokesUrl(ch: string): string {
  return `${import.meta.env.BASE_URL}strokes/${ch.codePointAt(0)!.toString(16)}.json`;
}

export const loadStrokes: CharDataLoaderFn = (ch, onLoad, onError) => {
  fetch(strokesUrl(ch))
    .then((r) => (r.ok ? (r.json() as Promise<CharacterJson>) : Promise.reject(new Error(`Sin trazos para ${ch}`))))
    .then(onLoad, onError);
};

/** Caracteres chinos distintos que hay que escribir en estas palabras. */
export function charsToWrite(words: Word[]): string[] {
  const set = new Set<string>();
  for (const w of words) for (const ch of w.hanzi) if (/\p{Script=Han}/u.test(ch)) set.add(ch);
  return [...set];
}

/**
 * Cuántos de estos caracteres tienen sus trazos guardados en el dispositivo.
 * Devuelve null si el navegador no permite guardar archivos para usar sin internet.
 */
export async function countSavedStrokes(chars: string[]): Promise<number | null> {
  if (typeof caches === 'undefined') return null;
  // El service worker guarda cada archivo con su versión al final (?__WB_REVISION__=…), por eso ignoreSearch.
  const found = await Promise.all(chars.map((ch) => caches.match(strokesUrl(ch), { ignoreSearch: true }).catch(() => undefined)));
  return found.filter(Boolean).length;
}
