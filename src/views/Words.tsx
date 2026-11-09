import { useMemo, useState } from 'react';
import { IconScan, IconSearch, IconSpeaker } from '../components/Icons';
import { POS_GROUP_ORDER, posGroup, type Word } from '../data/levels';
import { isNative } from '../lib/native';
import type { Progress } from '../lib/progress';
import { canSpeak, speak } from '../lib/speech';
import { isLearning, isMature } from '../lib/srs';
import type { WordsState } from '../lib/useWords';
import type { View } from '../App';

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const STATUS = {
  unseen: ['Sin ver', 'unseen'],
  learn: ['Aprendiendo', 'learn'],
  review: ['En repaso', 'review'],
  master: ['Dominada', 'master'],
} as const;

export function Words({ p, words, go }: { p: Progress; words: WordsState; go: (v: View) => void }) {
  const [q, setQ] = useState('');

  const index = useMemo(
    () =>
      words.words.map((w) => {
        const py = plain(w.pinyin);
        return { w, key: [w.hanzi, py, py.replace(/[\s']/g, ''), plain(w.es)].join(' ') };
      }),
    [words.words],
  );

  const query = plain(q).trim();
  const compact = query.replace(/[\s']/g, '');
  const filtered = index.filter((x) => !query || x.key.includes(query) || (compact && x.key.includes(compact))).map((x) => x.w);

  const groups = new Map<string, Word[]>();
  for (const w of filtered) {
    const g = posGroup(w.pos);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(w);
  }

  const status = (w: Word) => {
    const c = p.decks.read[String(w.id)];
    if (!c) return STATUS.unseen;
    if (isLearning(c)) return STATUS.learn;
    return isMature(c) ? STATUS.master : STATUS.review;
  };

  return (
    <section className="view" aria-labelledby="h-pal">
      <header className="top">
        <h1 id="h-pal">Palabras</h1>
        <span className="chip">{words.words.length} palabras</span>
      </header>
      <label className="search" htmlFor="q">
        <IconSearch size={18} />
        <span className="sr">Buscar palabras</span>
        <input id="q" type="search" placeholder="Busca en chino, pinyin o español" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <button type="button" className="btn-line" onClick={() => go('leer')}>
        <IconScan size={18} />
        {isNative ? 'Leer un texto o una foto en chino' : 'Leer un texto en chino'}
      </button>
      {POS_GROUP_ORDER.filter((g) => groups.has(g)).map((g) => (
        <section key={g} className="wgroup">
          <h2 className="label">{g}</h2>
          <ul className="wl">
            {groups.get(g)!.map((w) => {
              const [label, cls] = status(w);
              return (
                <li key={w.id}>
                  <details>
                    <summary>
                      <span className="hz w-hz" lang="zh-Hans">{w.hanzi}</span>
                      <span className="w-mid">
                        <span className="w-py">{w.pinyin}</span>
                        <span className="w-es">{w.es}</span>
                      </span>
                      <span className={`pill ${cls}`}>{label}</span>
                    </summary>
                    <div className="w-body">
                      <div>
                        <p className="hz ex-hz" lang="zh-Hans">{w.ex.zh}</p>
                        <p className="ex-py">{w.ex.py}</p>
                        <p className="ex-es">{w.ex.es}</p>
                      </div>
                      {canSpeak && (
                        <button type="button" className="icon-btn" aria-label={`Escuchar ${w.pinyin}`} onClick={() => speak(`${w.hanzi}。${w.ex.zh}`)}>
                          <IconSpeaker size={18} />
                        </button>
                      )}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {!filtered.length && <p className="empty">No hay palabras que coincidan.</p>}
    </section>
  );
}
