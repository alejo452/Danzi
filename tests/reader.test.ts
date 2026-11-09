import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Word } from '../src/data/levels';
import { freshProgress, type Progress } from '../src/lib/progress';
import { bestKnowledge, buildDictionary, foundWords, hasChinese, knowledgeOf, pieces, readingSummary, segment, type SyllabusRow, type Token } from '../src/lib/reader';
import type { StoredCard } from '../src/lib/srs';

const rows = JSON.parse(fs.readFileSync('data-source/hsk-2025-syllabus.json', 'utf8')) as SyllabusRow[];
const words = ['1', '2', '3', '4', '5', '6'].flatMap((l) => JSON.parse(fs.readFileSync(`src/data/hsk/level-${l}.json`, 'utf8')) as Word[]);
const dict = buildDictionary(rows, words);

/** Cómo quedó separado: las palabras con «/», lo desconocido entre corchetes y lo demás tal cual. */
const show = (tokens: Token[]) => tokens.map((t) => (t.kind === 'palabra' ? t.text : t.kind === 'desconocida' ? `[${t.text}]` : t.text)).join('/');

describe('separar un texto en palabras del temario', () => {
  it('arma el diccionario con las 11 000 palabras y el significado de las que ya están en Danzi', () => {
    expect(dict.maxLen).toBe(4);
    expect(dict.byHanzi.get('喜欢')).toEqual([{ id: 225, level: '1', hanzi: '喜欢', pinyin: 'xǐhuan', pos: expect.any(String), es: expect.any(String) }]);
    // Las de HSK 7–9 todavía no tienen significado en Danzi.
    expect(dict.byHanzi.get('命')!.map((e) => [e.level, !!e.es])).toEqual([['5', true], ['7-9', false]]);
  });

  it('separa una frase sencilla', () => {
    expect(show(segment('我喜欢喝茶。', dict))).toBe('我/喜欢/喝/茶/。');
    expect(show(segment('今天天气很好', dict))).toBe('今天/天气/很/好');
  });

  it('en una ambigüedad elige la separación que tiene sentido', () => {
    // 研究/生命/起源 («investigar el origen de la vida»), no 研究生/命/起源.
    expect(show(segment('研究生命起源', dict))).toBe('研究/生命/起源');
    expect(show(segment('他是大学生', dict))).toBe('他/是/大学生');
  });

  it('deja tal cual la puntuación, las letras, los números y los saltos de línea', () => {
    expect(show(segment('Hola, 你好！\n123', dict))).toBe('Hola, /你好/！\n123');
  });

  it('marca los caracteres que no forman palabras del temario', () => {
    const tokens = segment('犇喝茶', dict);
    expect(show(tokens)).toBe('[犇]/喝/茶');
    expect(tokens[0].kind).toBe('desconocida');
  });

  it('una palabra con varias lecturas trae todas', () => {
    const [t] = segment('长', dict);
    expect(t.kind === 'palabra' && t.entries.map((e) => e.pinyin)).toEqual(['cháng', 'zhǎng']);
  });

  it('pega los signos a la palabra para que una línea no empiece con «，» ni termine con «「»', () => {
    const lay = (text: string) => {
      const tokens = segment(text, dict);
      return pieces(tokens).map((p) => (p.kind === 'texto' ? `{${p.text}}` : `${p.before}[${tokens[p.index].text}]${p.after}`));
    };
    expect(lay('今天天气很好，\n我们去吧！')).toEqual(['[今天]', '[天气]', '[很]', '[好]，', '{\n}', '[我们]', '[去]', '[吧]！']);
    expect(lay('他说：「你好」。')).toEqual(['[他]', '[说]：', '「[你好]」。']);
    // Al comienzo y al final no hay palabra a la que pegarlos.
    expect(lay('「你好')).toEqual(['「[你好]']);
    expect(lay('（你好）')).toEqual(['（[你好]）']);
    expect(lay('Hola, 你好! OK')).toEqual(['{Hola, }', '[你好]!', '{ OK}']);
    // Cada palabra sigue apuntando a su token.
    const tokens = segment('我喝茶。', dict);
    expect(pieces(tokens).map((p) => p.index)).toEqual([0, 1, 2]);
  });

  it('sabe si un texto tiene chino', () => {
    expect(hasChinese('Hola')).toBe(false);
    expect(hasChinese('Hola 你')).toBe(true);
  });
});

describe('qué tanto conoce Diego cada palabra', () => {
  const card = (state: number, scheduled_days: number): StoredCard => ({
    due: '2026-11-20T00:00:00.000Z',
    stability: scheduled_days,
    difficulty: 5,
    elapsed_days: 1,
    scheduled_days,
    learning_steps: 0,
    reps: 3,
    lapses: 0,
    state,
    last_review: '2026-11-08T12:00:00.000Z',
  });
  // 我 dominada, 喜欢 en repaso, 喝 aprendiendo; 茶 nueva.
  const p: Progress = { ...freshProgress(), decks: { read: { '221': card(2, 30), '225': card(2, 5), '77': card(1, 0) }, write: {} } };
  const entry = (hanzi: string) => dict.byHanzi.get(hanzi)![0];

  it('según su tarjeta de lectura', () => {
    expect(['我', '喜欢', '喝', '茶'].map((h) => knowledgeOf(entry(h), p))).toEqual(['dominada', 'repaso', 'aprendiendo', 'nueva']);
    // De HSK 7–9: todavía no está en Danzi.
    expect(knowledgeOf(dict.byHanzi.get('命')![1], p)).toBe('fuera');
    expect(bestKnowledge(dict.byHanzi.get('命')!, p)).toBe('nueva');
  });

  it('cuenta las palabras distintas del texto', () => {
    const tokens = segment('我喜欢喝茶，我喜欢喝茶。犇犇', dict);
    expect(foundWords(tokens).map((w) => [w.text, w.count])).toEqual([['我', 2], ['喜欢', 2], ['喝', 2], ['茶', 2]]);
    expect(readingSummary(tokens, p)).toEqual({ words: 4, unknown: 1, dominada: 1, repaso: 1, aprendiendo: 1, nueva: 1, fuera: 0 });
  });
});
