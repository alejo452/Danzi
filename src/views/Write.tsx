import { useEffect, useRef, useState } from 'react';
import HanziWriter from 'hanzi-writer';
import { CoinCount } from '../components/CoinCount';
import { IconSpeaker } from '../components/Icons';
import { MascotSays } from '../components/MascotCard';
import { RateButtons } from '../components/RateButtons';
import { plural } from '../lib/dates';
import { PHRASES } from '../lib/mascot';
import { addExtraNew, ANSWER_CAP_S, answerSeconds, newLeftToday, recordAnswer, todayLog, type Progress } from '../lib/progress';
import { nextCard, nextDueText, type QueueCounts } from '../lib/queue';
import { canSpeak, speak } from '../lib/speech';
import { GRADE_LABEL, previewAll, Rating, State, type Grade, type StoredCard } from '../lib/srs';
import { loadStrokes } from '../lib/strokes';
import { getProgress, updateProgress } from '../lib/useProgress';
import { deckFor, newCandidates, type WordsState } from '../lib/useWords';
import type { View } from '../App';

type Props = { p: Progress; words: WordsState; counts: QueueCounts; go: (v: View) => void };

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function Write({ p, words, counts, go }: Props) {
  const [current, setCurrent] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [hinted, setHinted] = useState(false);
  const [animated, setAnimated] = useState(false);
  const [outline, setOutline] = useState(false);
  const [done, setDone] = useState(false);
  const [preview, setPreview] = useState<{ at: Date; cards: Record<Grade, StoredCard> } | null>(null);
  const [failed, setFailed] = useState(false);
  const target = useRef<HTMLDivElement>(null);
  const writer = useRef<HanziWriter | null>(null);
  const [size, setSize] = useState(280);

  const shownAt = useRef(Date.now());
  const deck = deckFor(p, 'write', words.byId);
  const candidates = newCandidates(p, 'write', words.words);

  useEffect(() => {
    if (words.loading) return;
    if (current && words.byId.has(current)) return;
    setCurrent(nextCard(deck, candidates, newLeftToday(p, 'write', new Date()), new Date()));
    // Cuándo apareció la palabra: el tiempo de estudio suma lo que tarda cada respuesta (con tope).
    shownAt.current = Date.now();
    setIdx(0);
    setMistakes(0);
    setHinted(false);
    setAnimated(false);
    setOutline(false);
    setDone(false);
    setPreview(null);
  });

  const chars = current ? Array.from(words.byId.get(current)?.hanzi ?? '') : [];

  // Crea el área de escritura para el carácter actual.
  useEffect(() => {
    if (!current || done || !target.current) return;
    const el = target.current;
    const width = Math.min(300, Math.max(220, (el.closest('main')?.clientWidth ?? 340) - 36));
    setSize(width);
    el.innerHTML = '';
    const w = HanziWriter.create(el, chars[idx], {
      width,
      height: width,
      padding: 14,
      showCharacter: false,
      showOutline: false,
      strokeColor: token('--fg'),
      outlineColor: token('--outline'),
      drawingColor: token('--accent'),
      highlightColor: token('--easy'),
      drawingWidth: Math.round(width / 16),
      charDataLoader: loadStrokes,
      onLoadCharDataError: () => setFailed(true),
    });
    writer.current = w;
    startQuiz(w);
    return () => {
      w.cancelQuiz();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, idx, done]);

  function startQuiz(w: HanziWriter) {
    w.quiz({
      showHintAfterMisses: 3,
      leniency: 1.1,
      onMistake: () => setMistakes((m) => m + 1),
      onComplete: () => setTimeout(() => advance(), 450),
    });
  }

  // Refs para que los callbacks del área de escritura lean siempre el estado actual.
  const live = useRef({ idx, current, count: chars.length });
  live.current = { idx, current, count: chars.length };

  function advance() {
    const { idx: i, current: id, count } = live.current;
    if (!id) return;
    setOutline(false);
    if (i + 1 < count) {
      setIdx(i + 1);
      return;
    }
    const now = new Date();
    setPreview({ at: now, cards: previewAll(getProgress().decks.write[id], now) });
    setDone(true);
  }

  const suggestion = (): Grade => {
    if (animated) return Rating.Again;
    if (mistakes === 0 && !hinted) return Rating.Good;
    if (mistakes <= 2 * chars.length) return Rating.Hard;
    return Rating.Again;
  };

  const rate = (g: Grade) => {
    if (!current || !preview) return;
    const seconds = answerSeconds(shownAt.current, Date.now(), ANSWER_CAP_S.write);
    updateProgress((q) => recordAnswer(q, 'write', current, preview.cards[g], new Date(), seconds));
    setCurrent(null);
  };

  const header = (
    <>
      <header className="top"><h1 id="h-esc">Escritura</h1><CoinCount value={p.rewards.coins} /></header>
      <div className="mini" aria-label="Caracteres pendientes hoy">
        <span><b className="c-new">{counts.newLeft}</b> nuevos</span>
        <span><b className="c-learn">{counts.learn}</b> aprendiendo</span>
        <span><b className="c-rev">{counts.review}</b> para repasar</span>
      </div>
    </>
  );

  if (words.loading) return <section className="view">{header}</section>;

  if (failed) {
    return (
      <section className="view" aria-labelledby="h-esc">
        {header}
        <div className="panel done">
          <h2>No se pudieron cargar los trazos</h2>
          <p>Todavía no están guardados en este dispositivo. Abre la app con internet, espera un momento a que se descarguen y vuelve a intentarlo.</p>
          <div className="btns"><button type="button" className="btn-primary" onClick={() => { setFailed(false); setCurrent(null); }}>Reintentar</button></div>
        </div>
      </section>
    );
  }

  if (!current) {
    const none = Object.keys(p.decks.read).length === 0;
    const tl = todayLog(p, new Date());
    const parts: string[] = [];
    if (none) parts.push('Aprende tus primeras palabras en Repasar y aparecerán aquí para que las escribas.');
    else {
      parts.push(tl.w ? `Hoy escribiste ${plural(tl.w, 'palabra', 'palabras')}.` : 'No tienes caracteres pendientes ahora.');
      const nd = nextDueText(deck, new Date());
      if (nd) parts.push(nd);
      if (!candidates.length) parts.push('Para escribir más, aprende palabras nuevas en Repasar.');
    }
    return (
      <section className="view" aria-labelledby="h-esc">
        {header}
        <div className="panel done">
          <MascotSays mood={tl.w > 0 ? 'feliz' : 'listo'} phrase={tl.w > 0 ? PHRASES.muyBien : PHRASES.escribir} />
          <h2>{none ? 'Aún no hay caracteres para escribir' : 'Listo por hoy'}</h2>
          <p>{parts.join(' ')}</p>
          <div className="btns">
            {!none && candidates.length > 0 && (
              <button type="button" className="btn-primary" onClick={() => updateProgress((q) => addExtraNew(q, 'write', 3, new Date()))}>
                Practicar 3 palabras más
              </button>
            )}
            {(none || !candidates.length) && <button type="button" className="btn-line" onClick={() => go('repasar')}>Ir a Repasar</button>}
          </div>
        </div>
      </section>
    );
  }

  const w = words.byId.get(current)!;
  const card = p.decks.write[current];
  const tag = !card ? ['NUEVO', 'new'] : card.state === State.Review ? ['REPASO', 'review'] : ['APRENDIENDO', 'learn'];
  const sug = suggestion();
  const info = done
    ? mistakes === 0 && !hinted && !animated
      ? '¡Sin errores!'
      : `Lo escribiste con ${plural(mistakes, 'error', 'errores')}${hinted || animated ? ' y con ayuda' : ''}.`
    : `${chars.length > 1 ? `Carácter ${idx + 1} de ${chars.length} · ` : ''}${mistakes ? plural(mistakes, 'error', 'errores') : 'Escribe trazo a trazo'}`;

  return (
    <section className="view" aria-labelledby="h-esc">
      {header}
      <div className="session">
        <div className="panel wprompt">
          <span className={`tag ${tag[1]}`}>{tag[0]}</span>
          <p className="f-py">{w.pinyin}</p>
          <p className="f-es">{w.es}</p>
          {(chars.length > 1 || done) && (
            <div className="slots" aria-hidden="true">
              {chars.map((ch, i) => (
                <span key={i} className={`slot${done || i < idx ? ' ok' : i === idx ? ' cur' : ''}`}>{done || i < idx ? ch : ''}</span>
              ))}
            </div>
          )}
        </div>
        {!done && (
          <div className="stage" style={{ width: size, height: size }}>
            <svg className="grid" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <line x1="50" y1="0" x2="50" y2="100" vectorEffect="non-scaling-stroke" />
              <line x1="0" y1="50" x2="100" y2="50" vectorEffect="non-scaling-stroke" />
              <line x1="0" y1="0" x2="100" y2="100" vectorEffect="non-scaling-stroke" />
              <line x1="100" y1="0" x2="0" y2="100" vectorEffect="non-scaling-stroke" />
            </svg>
            <div ref={target} className="writer-target" role="img" aria-label="Zona para escribir el carácter con el dedo" />
          </div>
        )}
        <p className="hint" aria-live="polite">{info}</p>
        {!done ? (
          <div className="wtools">
            <button
              type="button"
              className="ghost"
              onClick={() => {
                const next = !outline;
                setOutline(next);
                if (next) {
                  setHinted(true);
                  writer.current?.showOutline();
                } else writer.current?.hideOutline();
              }}
            >
              {outline ? 'Ocultar contorno' : 'Ver contorno'}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                const wr = writer.current;
                if (!wr) return;
                setAnimated(true);
                wr.cancelQuiz();
                wr.animateCharacter({ onComplete: () => setTimeout(() => startQuiz(wr), 300) });
              }}
            >
              Ver trazos
            </button>
            {canSpeak && (
              <button type="button" className="ghost" onClick={() => speak(w.hanzi)}>
                <IconSpeaker size={18} />Escuchar
              </button>
            )}
          </div>
        ) : (
          preview && (
            <div className="controls">
              <p className="rates-help">Te sugerimos «{GRADE_LABEL[sug]}». Debajo ves cuándo vuelve.</p>
              <RateButtons preview={preview.cards} now={preview.at} onRate={rate} suggested={sug} />
            </div>
          )
        )}
      </div>
    </section>
  );
}
