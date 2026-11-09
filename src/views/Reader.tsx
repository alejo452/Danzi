import { useEffect, useMemo, useState } from 'react';
import { IconBack, IconCamera, IconImage, IconSpeaker } from '../components/Icons';
import { isReady, LEVELS, loadLevels, type Word } from '../data/levels';
import { plural } from '../lib/dates';
import { isNative } from '../lib/native';
import type { PhotoSource } from '../lib/ocr';
import type { Progress } from '../lib/progress';
import {
  bestKnowledge,
  buildDictionary,
  foundWords,
  hasChinese,
  KNOWLEDGE_LABEL,
  knowledgeOf,
  pieces,
  readingSummary,
  segment,
  type Dictionary,
  type Entry,
  type Knowledge,
  type SyllabusRow,
  type Token,
} from '../lib/reader';
import { canSpeak, speak } from '../lib/speech';
import type { View } from '../App';

// Leer un texto (#leer): se pega un texto en chino (o, en la APK, se lee de una foto) y Danzi lo separa en palabras
// del temario, con su pinyin, su significado y si Diego ya la estudia. La separación está en src/lib/reader.ts.

/** Lo que hace falta para leer: el temario completo y las palabras de los niveles que ya están en Danzi. */
type ReaderData = { dict: Dictionary; words: Map<number, Word> };

let data: Promise<ReaderData> | null = null;

function loadReaderData(): Promise<ReaderData> {
  data ??= Promise.all([
    import('../../data-source/hsk-2025-syllabus.json'),
    loadLevels(LEVELS.filter((l) => isReady(l.id)).map((l) => l.id)),
  ]).then(([syllabus, words]) => ({
    dict: buildDictionary(syllabus.default as unknown as SyllabusRow[], words),
    words: new Map(words.map((w) => [w.id, w])),
  }));
  return data;
}

/** El texto se conserva al ir a otra pestaña y volver. */
let lastText = '';

const MAX_TEXT = 5000;

/** Las etiquetas de la lista, con las mismas clases de color que Palabras. */
const PILL: Record<Knowledge, string> = { dominada: 'master', repaso: 'review', aprendiendo: 'learn', nueva: 'unseen', fuera: 'unseen' };

function levelLabel(level: string): string {
  return `HSK ${level.replace('-', '–')}`;
}

/** Lo que dice una lectura de la palabra: pinyin, nivel y significado. */
function EntryLine({ entry, p }: { entry: Entry; p: Progress }) {
  const k = knowledgeOf(entry, p);
  return (
    <div className="rd-entry">
      <p>
        <b>{entry.pinyin}</b> · {levelLabel(entry.level)}
      </p>
      <p className={entry.es ? undefined : 'note'}>{entry.es ?? 'Todavía no tiene significado en Danzi: es del HSK 7–9.'}</p>
      <span className={`pill ${PILL[k]}`}>{KNOWLEDGE_LABEL[k]}</span>
    </div>
  );
}

/** «12 palabras del temario: ya estudias 5 y 7 todavía no. 2 caracteres no forman palabras del temario.» */
function summaryText(s: ReturnType<typeof readingSummary>): string {
  const known = s.dominada + s.repaso + s.aprendiendo;
  const notYet = s.nueva + s.fuera;
  let out = !s.words
    ? 'Ninguna palabra del temario.'
    : `${plural(s.words, 'palabra del temario', 'palabras del temario')}: ${
        !known ? 'todavía no estudias ninguna' : !notYet ? (known === 1 ? 'ya la estudias' : 'ya las estudias todas') : `ya estudias ${known} y ${notYet} todavía no`
      }.`;
  if (s.unknown) out += ` ${plural(s.unknown, 'carácter no forma', 'caracteres no forman')} palabras del temario.`;
  return out;
}

export function Reader({ p, go }: { p: Progress; go: (v: View) => void }) {
  const [text, setText] = useState(lastText);
  const [reader, setReader] = useState<ReaderData | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState(-1);
  const [unknownPinyin, setUnknownPinyin] = useState<Record<string, string>>({});
  const [photo, setPhoto] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadReaderData()
      .then(setReader)
      .catch(() => setFailed(true));
    // En la APK, el celular descarga el lector de chino la primera vez: se pide de una vez para no esperar en la foto.
    if (isNative) import('../native/ocr').then((m) => m.prepareReader()).catch(() => undefined);
  }, []);

  const change = (t: string) => {
    lastText = t;
    setText(t);
    setSelected(-1);
  };

  const tokens = useMemo<Token[]>(() => (reader && hasChinese(text) ? segment(text, reader.dict) : []), [reader, text]);
  const found = useMemo(() => foundWords(tokens), [tokens]);
  const layout = useMemo(() => pieces(tokens), [tokens]);
  const summary = useMemo(() => readingSummary(tokens, p), [tokens, p]);

  // El pinyin de los caracteres que no están en el temario sale de pinyin-pro (se carga solo si hace falta).
  useEffect(() => {
    const missing = [...new Set(tokens.filter((t) => t.kind === 'desconocida').map((t) => t.text))].filter((c) => !(c in unknownPinyin));
    if (!missing.length) return;
    import('pinyin-pro')
      .then(({ pinyin }) => setUnknownPinyin((old) => ({ ...old, ...Object.fromEntries(missing.map((c) => [c, pinyin(c)])) })))
      .catch(() => undefined);
  }, [tokens, unknownPinyin]);

  const readPhoto = async (source: PhotoSource) => {
    setBusy(true);
    setPhoto('');
    const result = await import('../native/ocr')
      .then((m) => m.readPhoto(source, () => setPhoto('Leyendo el texto de la foto…')))
      .catch(() => ({ error: 'No se pudo leer la foto. Cierra Danzi, ábrela de nuevo y vuelve a intentarlo.' }));
    setBusy(false);
    if (!result) setPhoto('');
    else if ('error' in result) setPhoto(result.error);
    else if (!hasChinese(result.text)) setPhoto('No encontramos texto en chino en la foto. Tómala más de cerca, derecha y con buena luz.');
    else {
      change(result.text.slice(0, MAX_TEXT));
      setPhoto('Listo. Si algún carácter quedó mal, corrígelo en el texto.');
    }
  };

  const current = selected >= 0 ? tokens[selected] : undefined;
  const say = (hz: string) => canSpeak && speak(hz, 0.8);
  const pick = (i: number) => {
    setSelected(i);
    const t = tokens[i];
    if (t && t.kind !== 'otro') say(t.text);
  };

  return (
    <section className="view" aria-labelledby="h-leer">
      <button type="button" className="back-link" onClick={() => go('palabras')}><IconBack size={18} />Palabras</button>
      <header className="top"><h1 id="h-leer">Leer un texto</h1></header>

      <section className="panel" aria-label="Texto para leer">
        {isNative && (
          <>
            <p className="note">Tómale una foto a un texto en chino (un libro, un menú, un letrero) o elige una que ya tengas.</p>
            <div className="two">
              <button type="button" className="btn-line" disabled={busy} onClick={() => readPhoto('camara')}>
                <IconCamera size={18} />Tomar foto
              </button>
              <button type="button" className="btn-line" disabled={busy} onClick={() => readPhoto('galeria')}>
                <IconImage size={18} />Elegir foto
              </button>
            </div>
            <div role="status">{photo && <p className="note">{photo}</p>}</div>
          </>
        )}
        <label className="field" htmlFor="rd-text">
          <span>{isNative ? 'O pega el texto' : 'Texto en chino'}</span>
          <textarea
            id="rd-text"
            className="rd-input"
            lang="zh-Hans"
            rows={4}
            maxLength={MAX_TEXT}
            placeholder="例如：我喜欢喝茶。"
            value={text}
            onChange={(e) => change(e.target.value)}
          />
        </label>
        {!isNative && <p className="note">¿El texto está en una foto? Google Lens lo lee: cópialo allá y pégalo aquí.</p>}
        {text && (
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              change('');
              setPhoto('');
            }}
          >
            Borrar el texto
          </button>
        )}
      </section>

      {failed && <p className="warn" role="status">No se pudo cargar el diccionario. Cierra Danzi, ábrela de nuevo y vuelve a intentarlo.</p>}
      {!failed && !reader && hasChinese(text) && <p className="note" role="status">Cargando el diccionario…</p>}
      {text && !hasChinese(text) && <p className="note" role="status">El texto no tiene caracteres chinos.</p>}

      {tokens.length > 0 && (
        <>
          <section className="panel" aria-labelledby="h-rd-texto">
            <h2 className="label" id="h-rd-texto">El texto</h2>
            <p className="note">
              {summaryText(summary)} Las que todavía no estudias van subrayadas. Toca una palabra para escucharla y ver qué significa.
            </p>
            <p className="rd-text" lang="zh-Hans">
              {layout.map((piece) => {
                if (piece.kind === 'texto') return <span key={`t${piece.index}`}>{piece.text}</span>;
                const t = tokens[piece.index];
                const word = (
                  <button
                    key={`p${piece.index}`}
                    type="button"
                    className={`rd-word${t.kind === 'desconocida' || (t.kind === 'palabra' && ['nueva', 'fuera'].includes(bestKnowledge(t.entries, p))) ? ' rd-new' : ''}`}
                    aria-pressed={piece.index === selected}
                    onClick={() => pick(piece.index)}
                  >
                    {t.text}
                  </button>
                );
                return piece.before || piece.after ? (
                  <span key={`p${piece.index}`} className="rd-nb">
                    {piece.before}
                    {word}
                    {piece.after}
                  </span>
                ) : (
                  word
                );
              })}
            </p>
            {current && current.kind !== 'otro' && (
              <div className="rd-detail" role="status">
                <div className="rd-head">
                  <span className="hz rd-hz" lang="zh-Hans">{current.text}</span>
                  {canSpeak && (
                    <button type="button" className="icon-btn" aria-label={`Escuchar ${current.text}`} onClick={() => say(current.text)}>
                      <IconSpeaker size={18} />
                    </button>
                  )}
                </div>
                {current.kind === 'palabra' ? (
                  <>
                    {current.entries.map((e) => <EntryLine key={e.id} entry={e} p={p} />)}
                    {(() => {
                      const ex = current.entries.map((e) => reader!.words.get(e.id)?.ex).find(Boolean);
                      return ex ? (
                        <div className="rd-ex">
                          <p className="hz" lang="zh-Hans">{ex.zh}</p>
                          <p className="ex-py">{ex.py}</p>
                          <p className="ex-es">{ex.es}</p>
                        </div>
                      ) : null;
                    })()}
                  </>
                ) : (
                  <div className="rd-entry">
                    {unknownPinyin[current.text] && <p><b>{unknownPinyin[current.text]}</b></p>}
                    <p className="note">No está en el temario del HSK. Puede ser parte de un nombre o de una palabra más difícil.</p>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="wgroup" aria-labelledby="h-rd-lista">
            <h2 className="label" id="h-rd-lista">Palabras del texto</h2>
            <ul className="wl">
              {found.map((w) => {
                const k = bestKnowledge(w.entries, p);
                const withMeaning = w.entries.find((e) => e.es);
                return (
                  <li key={w.text} className="rd-row">
                    <span className="hz w-hz" lang="zh-Hans">{w.text}</span>
                    <span className="w-mid">
                      <span className="w-py">{w.entries.map((e) => e.pinyin).filter((v, i, a) => a.indexOf(v) === i).join(' · ')}</span>
                      <span className="w-es">{withMeaning?.es ?? `${levelLabel(w.entries[0].level)}: todavía no está en Danzi`}</span>
                    </span>
                    <span className={`pill ${PILL[k]}`}>{KNOWLEDGE_LABEL[k]}</span>
                    {canSpeak && (
                      <button type="button" className="icon-btn" aria-label={`Escuchar ${w.text}`} onClick={() => say(w.text)}>
                        <IconSpeaker size={18} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </section>
  );
}
