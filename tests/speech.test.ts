import { describe, expect, it } from 'vitest';
import { compareSpeech, digitsToHanzi, isErhua } from '../src/lib/compare';
import { eligibleForTones, toneOptions } from '../src/lib/tones';
import type { Word } from '../src/data/levels';

describe('comparar pronunciación', () => {
  it('da 100 % cuando se entiende la frase completa', () => {
    expect(compareSpeech('我是学生。', '我是学生').score).toBe(1);
  });

  it('acepta palabras que suenan igual', () => {
    expect(compareSpeech('他是我的朋友。', '她是我得朋友').score).toBe(1);
  });

  it('entiende cifras en lugar de caracteres', () => {
    expect(digitsToHanzi('8点10分')).toBe('八点十分');
    expect(compareSpeech('我八点去学校。', '我8点去学校').score).toBe(1);
  });

  it('une el erhua (聊天儿) pero no el 儿 de 儿子', () => {
    expect(isErhua('天', '儿', '')).toBe(true);
    expect(isErhua('天', '儿', '子')).toBe(false);
    expect(compareSpeech('我们聊天儿吧。', '我们聊天儿吧').parts.map((x) => x.ch)).toContain('天儿');
    expect(compareSpeech('今天儿子回来了。', '今天儿子回来了').parts.map((x) => x.ch)).toEqual(['今', '天', '儿', '子', '回', '来', '了', '。']);
  });

  it('marca lo que faltó', () => {
    const r = compareSpeech('我是学生。', '我学生');
    expect(r.parts.filter((x) => x.status === 'miss').map((x) => x.ch)).toEqual(['是']);
    expect(r.score).toBeCloseTo(0.75);
  });
});

const word = (hanzi: string, pinyin: string): Word => ({ id: 0, hanzi, pinyin, pos: '', es: '', ex: { zh: '', py: '', es: '' } });

describe('ejercicio de tonos', () => {
  it('genera cuatro opciones distintas que incluyen la correcta', () => {
    for (const py of ['mǎi', 'xièxie', 'diànyǐng', 'Zhōngguó']) {
      const opts = toneOptions(py);
      expect(opts).toHaveLength(4);
      expect(new Set(opts).size).toBe(4);
      expect(opts).toContain(py);
    }
  });

  it('descarta palabras que la voz podría leer distinto', () => {
    expect(eligibleForTones(word('谁', 'shéi/shuí'))).toBe(false);
    expect(eligibleForTones(word('水果', 'shuǐguǒ'))).toBe(false);
    expect(eligibleForTones(word('吗', 'ma'))).toBe(false);
    expect(eligibleForTones(word('电影', 'diànyǐng'))).toBe(true);
  });
});
