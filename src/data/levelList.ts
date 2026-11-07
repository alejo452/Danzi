// Niveles del HSK 3.0 según el 《HSK考试大纲》 de noviembre de 2025, sin cargar datos.
// Este archivo no usa import.meta.glob para que también lo pueda importar el service worker.

export type LevelInfo = { id: string; name: string; words: number };

export const LEVELS: LevelInfo[] = [
  { id: '1', name: 'HSK 1', words: 300 },
  { id: '2', name: 'HSK 2', words: 200 },
  { id: '3', name: 'HSK 3', words: 500 },
  { id: '4', name: 'HSK 4', words: 1000 },
  { id: '5', name: 'HSK 5', words: 1600 },
  { id: '6', name: 'HSK 6', words: 1800 },
  { id: '7-9', name: 'HSK 7–9', words: 5600 },
];

/** Nivel de una palabra según su id del temario: los ids van seguidos por nivel (1–300 HSK 1, 301–500 HSK 2…). */
export function levelOfId(id: number): string | undefined {
  let last = 0;
  for (const l of LEVELS) {
    last += l.words;
    if (id >= 1 && id <= last) return l.id;
  }
  return undefined;
}
