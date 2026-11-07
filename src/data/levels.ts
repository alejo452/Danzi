// Niveles del HSK 3.0 según el 《HSK考试大纲》 de noviembre de 2025.
// Un nivel está disponible en la app cuando existe su archivo src/data/hsk/level-<id>.json.

export type Word = {
  /** Número de la palabra en el temario oficial (1–11000). Es la clave del progreso: nunca cambiarlo. */
  id: number;
  hanzi: string;
  pinyin: string;
  /** Categoría gramatical tal como aparece en el temario (名, 动, 形…). */
  pos: string;
  /** Significado en español. */
  es: string;
  ex: { zh: string; py: string; es: string };
};

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

const files = import.meta.glob<{ default: Word[] }>('./hsk/level-*.json');

export function isReady(levelId: string): boolean {
  return `./hsk/level-${levelId}.json` in files;
}

export async function loadLevels(levelIds: string[]): Promise<Word[]> {
  const ordered = LEVELS.filter((l) => levelIds.includes(l.id) && isReady(l.id));
  const lists = await Promise.all(ordered.map((l) => files[`./hsk/level-${l.id}.json`]().then((m) => m.default)));
  return lists.flat();
}

const POS_GROUPS: { label: string; match: RegExp }[] = [
  { label: 'Sustantivos', match: /^名/ },
  { label: 'Verbos', match: /^动/ },
  { label: 'Adjetivos', match: /^形/ },
  { label: 'Adverbios', match: /^副/ },
  { label: 'Pronombres', match: /^代/ },
  { label: 'Números y clasificadores', match: /^(数|量)/ },
  { label: 'Partículas y conectores', match: /^(助|介|连|叹|前缀|后缀)/ },
];

export function posGroup(pos: string): string {
  return POS_GROUPS.find((g) => g.match.test(pos))?.label ?? 'Expresiones';
}

export const POS_GROUP_ORDER = [...POS_GROUPS.map((g) => g.label), 'Expresiones'];
