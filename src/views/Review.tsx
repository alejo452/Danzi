import { useEffect, useRef, useState } from 'react';
import { CoinCount } from '../components/CoinCount';
import { Confetti } from '../components/Confetti';
import { EnvelopeSheet } from '../components/Envelope';
import { MascotSays } from '../components/MascotCard';
import { IconSpeaker } from '../components/Icons';
import { RateButtons } from '../components/RateButtons';
import { plural } from '../lib/dates';
import { PHRASES } from '../lib/mascot';
import { addExtraNew, ANSWER_CAP_S, answerSeconds, newLeftToday, recordAnswer, todayLog, type Progress } from '../lib/progress';
import { nextCard, nextDueText, type QueueCounts } from '../lib/queue';
import { canOpenEnvelope, goalProgress } from '../lib/rewards';
import { canSpeak, speak } from '../lib/speech';
import { previewAll, State, type Grade, type StoredCard } from '../lib/srs';
import { getProgress, replaceProgress, updateProgress } from '../lib/useProgress';
import { deckFor, newCandidates, type WordsState } from '../lib/useWords';
import type { View } from '../App';

type Props = { p: Progress; words: WordsState; counts: QueueCounts; go: (v: View) => void };

export function Review({ p, words, counts, go }: Props) {
  const [current, setCurrent] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [preview, setPreview] = useState<{ at: Date; cards: Record<Grade, StoredCard> } | null>(null);
  const [undo, setUndo] = useState<{ before: Progress; id: string } | null>(null);
  // Tarjetas respondidas en esta visita: si se termina el repaso aquí, se celebra.
  const [answered, setAnswered] = useState(0);
  const [envelope, setEnvelope] = useState(false);
  // Cuándo apareció la tarjeta actual: el tiempo de estudio suma lo que tarda cada respuesta (con tope).
  const shownAt = useRef(Date.now());

  const deck = deckFor(p, 'read', words.byId);
  const candidates = newCandidates(p, 'read', words.words);

  // Elige la siguiente tarjeta cuando no hay una en curso.
  useEffect(() => {
    if (words.loading) return;
    if (current && words.byId.has(current)) return;
    setCurrent(nextCard(deck, candidates, newLeftToday(p, 'read', new Date()), new Date()));
    setShown(false);
    setPreview(null);
    shownAt.current = Date.now();
  });

  const flip = () => {
    if (!current || shown) return;
    const now = new Date();
    setPreview({ at: now, cards: previewAll(getProgress().decks.read[current], now) });
    setShown(true);
    if (p.settings.autoSpeak) speak(words.byId.get(current)!.hanzi);
  };

  const rate = (g: Grade) => {
    if (!current || !preview) return;
    const before = getProgress();
    const seconds = answerSeconds(shownAt.current, Date.now(), ANSWER_CAP_S.read);
    updateProgress((q) => recordAnswer(q, 'read', current, preview.cards[g], new Date(), seconds));
    setUndo({ before, id: current });
    setAnswered((n) => n + 1);
    setCurrent(null);
  };

  const doUndo = () => {
    if (!undo) return;
    replaceProgress(undo.before);
    setCurrent(undo.id);
    shownAt.current = Date.now();
    setShown(false);
    setPreview(null);
    setUndo(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if ((e.key === ' ' || e.key === 'Enter') && !shown) {
        if (t?.closest('button,a,summary') && t.id !== 'show-btn') return;
        e.preventDefault();
        flip();
      } else if (shown && /^[1-4]$/.test(e.key)) rate(Number(e.key) as Grade);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const header = (
    <>
      <header className="top">
        <h1 id="h-rep">Repaso</h1>
        <div className="top-r">
          <CoinCount value={p.rewards.coins} />
          <button type="button" className="ghost" disabled={!undo} onClick={doUndo}>Deshacer</button>
        </div>
      </header>
      <div className="mini" aria-label="Tarjetas pendientes hoy">
        <span><b className="c-new">{counts.newLeft}</b> nuevas</span>
        <span><b className="c-learn">{counts.learn}</b> aprendiendo</span>
        <span><b className="c-rev">{counts.review}</b> para repasar</span>
      </div>
    </>
  );

  if (words.loading) return <section className="view">{header}</section>;

  if (!current) {
    const now = new Date();
    const tl = todayLog(p, now);
    const goal = goalProgress(p, now);
    const parts = [tl.r ? `Hoy hiciste ${plural(tl.r, 'repaso', 'repasos')} y ganaste ${plural(tl.c, 'moneda', 'monedas')}.` : 'No tienes tarjetas pendientes ahora.'];
    const nd = nextDueText(deck, now);
    if (nd) parts.push(nd);
    if (!candidates.length) parts.push('Ya viste todas las palabras de los niveles activos.');
    if (tl.r && !goal.reached) parts.push(`Para la meta del día te ${goal.goal - goal.done === 1 ? 'falta 1 actividad' : `faltan ${goal.goal - goal.done} actividades`}: escribe o habla un rato.`);
    return (
      <section className="view" aria-labelledby="h-rep">
        {header}
        <div className="panel done">
          {answered > 0 && <Confetti />}
          <MascotSays mood={answered > 0 ? 'feliz' : 'listo'} phrase={answered > 0 ? PHRASES.completado : PHRASES.completo} />
          <h2>{answered > 0 ? '¡Terminaste el repaso!' : 'Listo por hoy'}</h2>
          <p>{parts.join(' ')}</p>
          <div className="btns">
            {canOpenEnvelope(p, now) && (
              <button type="button" className="btn-primary" onClick={() => setEnvelope(true)}>Abrir sobre rojo</button>
            )}
            {candidates.length > 0 && (
              <button type="button" className="btn-primary" onClick={() => updateProgress((q) => addExtraNew(q, 'read', 5, new Date()))}>
                Aprender 5 palabras más
              </button>
            )}
            <button type="button" className="btn-line" onClick={() => go('escribir')}>Practicar escritura</button>
          </div>
        </div>
        <EnvelopeSheet open={envelope} onClose={() => setEnvelope(false)} />
      </section>
    );
  }

  const w = words.byId.get(current)!;
  const card = p.decks.read[current];
  const tag = !card ? ['NUEVA', 'new'] : card.state === State.Review ? ['REPASO', 'review'] : ['APRENDIENDO', 'learn'];
  const len = Array.from(w.hanzi).length;

  return (
    <section className="view" aria-labelledby="h-rep">
      {header}
      <div className="session">
        <div
          key={`${current}-${shown}`}
          className={`flash${shown ? ' flipped' : ' can-flip enter'}`}
          onClick={(e) => !(e.target as HTMLElement).closest('button') && flip()}
          aria-live="polite"
        >
          <span className={`tag ${tag[1]}`}>{tag[0]}</span>
          <span className={`hz f-hz${len >= 3 ? ' len3' : len === 2 ? ' len2' : ''}`} lang="zh-Hans">{w.hanzi}</span>
          {!shown && p.settings.pinyinFront && <span className="f-pyfront">{w.pinyin}</span>}
          {shown ? (
            <div className="back">
              <div className="py-row">
                <span className="f-py">{w.pinyin}</span>
                {canSpeak && (
                  <button type="button" className="icon-btn" aria-label="Escuchar la palabra" onClick={() => speak(w.hanzi)}>
                    <IconSpeaker size={20} />
                  </button>
                )}
              </div>
              <p className="f-es">{w.es}</p>
              <div className="ex">
                <div className="ex-row">
                  <p className="hz ex-hz" lang="zh-Hans">{w.ex.zh}</p>
                  {canSpeak && (
                    <button type="button" className="icon-btn" aria-label="Escuchar el ejemplo" onClick={() => speak(w.ex.zh)}>
                      <IconSpeaker size={18} />
                    </button>
                  )}
                </div>
                <p className="ex-py">{w.ex.py}</p>
                <p className="ex-es">{w.ex.es}</p>
              </div>
            </div>
          ) : (
            <p className="hint">Intenta recordar el pinyin y el significado</p>
          )}
        </div>
        <div className="controls">
          {!shown ? (
            <button type="button" id="show-btn" className="btn-dark" onClick={flip}>Mostrar respuesta</button>
          ) : (
            preview && (
              <>
                <p className="rates-help">¿Qué tan fácil fue? Debajo ves cuándo vuelve.</p>
                <RateButtons preview={preview.cards} now={preview.at} onRate={rate} />
              </>
            )
          )}
        </div>
      </div>
    </section>
  );
}
