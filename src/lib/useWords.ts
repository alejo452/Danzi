import { useEffect, useMemo, useState } from 'react';
import { loadLevels, type Word } from '../data/levels';
import type { DeckKind, Progress } from './progress';

export type WordsState = { loading: boolean; words: Word[]; byId: Map<string, Word> };

/** Carga las palabras de los niveles activos. */
export function useWords(levels: string[]): WordsState {
  const [words, setWords] = useState<Word[] | null>(null);
  const key = levels.join(',');
  useEffect(() => {
    let alive = true;
    setWords(null);
    loadLevels(key.split(',')).then((w) => alive && setWords(w));
    return () => {
      alive = false;
    };
  }, [key]);
  const byId = useMemo(() => new Map((words ?? []).map((w) => [String(w.id), w])), [words]);
  return { loading: words === null, words: words ?? [], byId };
}

/**
 * Palabras que todavía no están en el mazo, en el orden del temario.
 * La escritura solo ofrece palabras que ya se vieron en las tarjetas de lectura.
 */
export function newCandidates(p: Progress, kind: DeckKind, words: Word[]): string[] {
  const out: string[] = [];
  for (const w of words) {
    const id = String(w.id);
    if (p.decks[kind][id]) continue;
    if (kind === 'write' && !p.decks.read[id]) continue;
    out.push(id);
  }
  return out;
}

/** Solo las tarjetas de palabras que pertenecen a los niveles cargados. */
export function deckFor(p: Progress, kind: DeckKind, byId: Map<string, Word>) {
  const deck: Progress['decks'][DeckKind] = {};
  for (const [id, c] of Object.entries(p.decks[kind])) if (byId.has(id)) deck[id] = c;
  return deck;
}
