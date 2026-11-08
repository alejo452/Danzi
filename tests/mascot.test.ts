// Xi Bao (喜宝): qué dice según cómo va el día y que el pinyin de sus frases sea correcto.
import { pinyin } from 'pinyin-pro';
import { describe, expect, it } from 'vitest';
import { addDays, dayKey } from '../src/lib/dates';
import { MASCOT, PHRASES, TAP_PHRASES, homeLine, type Phrase } from '../src/lib/mascot';
import { freshProgress, type Progress } from '../src/lib/progress';
import type { StoredCard } from '../src/lib/srs';

// --- Pinyin ---

const TONES: Record<string, number> = {
  ā: 1, á: 2, ǎ: 3, à: 4, ē: 1, é: 2, ě: 3, è: 4, ī: 1, í: 2, ǐ: 3, ì: 4,
  ō: 1, ó: 2, ǒ: 3, ò: 4, ū: 1, ú: 2, ǔ: 3, ù: 4, ǖ: 1, ǘ: 2, ǚ: 3, ǜ: 4,
};
const tone = (syllable: string) => [...syllable].map((c) => TONES[c] ?? 0).find((t) => t > 0) ?? 0;
const bare = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Caracteres que en estas frases van en tono neutro aunque pinyin-pro les ponga tono (意思 yìsi, 朋友 péngyou). */
const NEUTRAL_OK = new Set(['思', '友']);

/** Compara el pinyin de la frase, sílaba por sílaba y con tonos, con el de pinyin-pro. */
function checkPinyin({ zh, py }: Pick<Phrase, 'zh' | 'py'>) {
  const chars = [...zh].filter((c) => /\p{Script=Han}/u.test(c));
  const expected = pinyin(chars.join(''), { toneType: 'symbol', type: 'array' });
  const ours = [...py.normalize('NFC').toLowerCase()].filter((c) => /[a-zü]/.test(c) || c in TONES).join('');
  let i = 0;
  chars.forEach((c, k) => {
    const want = expected[k];
    const got = [...ours].slice(i, i + [...want].length).join('');
    i += [...want].length;
    expect(bare(got), `${zh}: letras de ${c}`).toBe(bare(want));
    const ok = tone(got) === tone(want) || (tone(got) === 0 && NEUTRAL_OK.has(c));
    expect(ok, `${zh}: tono de ${c} (escrito «${got}», esperado «${want}»)`).toBe(true);
  });
  expect(i, `${zh}: sobran letras en «${py}»`).toBe([...ours].length);
}

describe('frases de Xi Bao', () => {
  const all = [...Object.values(PHRASES), ...TAP_PHRASES, { zh: MASCOT.hz, py: MASCOT.py, es: MASCOT.name }];

  it('tienen el pinyin correcto, con tonos', () => {
    for (const phrase of all) checkPinyin(phrase);
  });

  it('tienen chino, pinyin y traducción', () => {
    for (const { zh, py, es } of all) {
      expect(zh.trim(), es).not.toBe('');
      expect(py.trim(), zh).not.toBe('');
      expect(es.trim(), zh).not.toBe('');
    }
  });

  it('la prueba de pinyin detecta tonos y sílabas equivocados', () => {
    expect(() => checkPinyin({ zh: '加油！', py: 'Jiàyóu!' })).toThrow();
    expect(() => checkPinyin({ zh: '加油！', py: 'Jiāyǒu!' })).toThrow();
    expect(() => checkPinyin({ zh: '晚安！', py: 'Wǎnān ba!' })).toThrow();
    expect(() => checkPinyin({ zh: '你好', py: 'Ni hǎo' })).toThrow(); // falta el tono de 你
  });
});

// --- Qué dice en Inicio ---

const AFTERNOON = new Date(2026, 10, 7, 15, 0);
const EVENING = new Date(2026, 10, 7, 18, 30);
const NIGHT = new Date(2026, 10, 7, 22, 0);

function card(due: Date): StoredCard {
  return { due: due.toISOString(), stability: 3, difficulty: 5, elapsed_days: 1, scheduled_days: 1, learning_steps: 0, reps: 2, lapses: 0, state: 2 };
}

/** Alguien que ya empezó: tiene tarjetas y practicó ayer. */
function started(now: Date, change: (p: Progress) => void = () => {}): Progress {
  const p = freshProgress();
  p.decks.read['1'] = card(addDays(now, 2));
  p.log[dayKey(addDays(now, -1))] = { r: 12 };
  change(p);
  return p;
}

describe('Xi Bao en Inicio', () => {
  it('se presenta la primera vez', () => {
    const line = homeLine(freshProgress(), AFTERNOON, 10);
    expect(line.mood).toBe('hola');
    expect(line.phrase).toBe(PHRASES.hola);
  });

  it('invita a repasar y cuenta las tarjetas', () => {
    const line = homeLine(started(AFTERNOON), AFTERNOON, 12);
    expect(line.mood).toBe('listo');
    expect(line.text).toBe('¿Repasamos? Tienes 12 tarjetas para hoy.');
    expect(homeLine(started(AFTERNOON), AFTERNOON, 1).text).toBe('¿Repasamos? Tienes 1 tarjeta para hoy.');
    expect(homeLine(started(AFTERNOON), AFTERNOON, 0).text).toContain('Practica la escritura o el habla');
  });

  it('se preocupa por la racha desde las 5 de la tarde', () => {
    expect(homeLine(started(EVENING), EVENING, 5)).toMatchObject({ mood: 'preocupado', text: 'Practica hoy para no perder tu racha de 1 día.' });
    const shielded = started(EVENING, (p) => {
      p.rewards.shields = 2;
    });
    expect(homeLine(shielded, EVENING, 5).text).toBe('Practica hoy para no perder tu racha de 1 día. Si no alcanzas, te cubren tus protectores.');
    // Sin racha no hay nada que perder.
    const noStreak = started(EVENING, (p) => {
      p.log = {};
    });
    expect(homeLine(noStreak, EVENING, 5).mood).toBe('listo');
  });

  it('anima mientras falta para la meta', () => {
    const p = started(AFTERNOON, (q) => {
      q.log[dayKey(AFTERNOON)] = { r: 19 };
    });
    expect(homeLine(p, AFTERNOON, 3)).toMatchObject({ mood: 'animado', text: 'Vas muy bien: te falta 1 actividad para la meta.' });
  });

  it('celebra la meta cumplida y recuerda el sobre rojo', () => {
    const p = started(AFTERNOON, (q) => {
      q.log[dayKey(AFTERNOON)] = { r: 20 };
    });
    expect(homeLine(p, AFTERNOON, 0)).toMatchObject({ mood: 'feliz', text: 'Cumpliste la meta de hoy. ¡Abre tu sobre rojo!' });
    p.rewards.envelopes[dayKey(AFTERNOON)] = 15;
    expect(homeLine(p, AFTERNOON, 0).text).toBe('Cumpliste la meta de hoy. ¡Qué bacano!');
  });

  it('se va a dormir si ya cumpliste la meta en la noche', () => {
    const p = started(NIGHT, (q) => {
      q.log[dayKey(NIGHT)] = { r: 25 };
    });
    expect(homeLine(p, NIGHT, 0)).toMatchObject({ mood: 'dormido', phrase: PHRASES.buenasNoches });
  });
});
