import { useEffect, useRef, useState } from 'react';
import { CoinCount } from '../components/CoinCount';
import { IconMic, IconSpeaker } from '../components/Icons';
import { MascotSays } from '../components/MascotCard';
import type { Word } from '../data/levels';
import type { Comparison } from '../lib/compare';
import { plural } from '../lib/dates';
import { PHRASES } from '../lib/mascot';
import { recordSpeaking, type Progress } from '../lib/progress';
import { canInstallVoice, canListen, canSpeak, checkChineseVoice, installVoice, listenOnce, speak } from '../lib/speech';
import { eligibleForTones, shuffle, toneOptions } from '../lib/tones';
import { updateProgress } from '../lib/useProgress';
import type { WordsState } from '../lib/useWords';

type Props = { p: Progress; words: WordsState };
type Mode = 'tonos' | 'repetir';

const bump = () => updateProgress((q) => recordSpeaking(q, new Date()));

export function Speak({ p, words }: Props) {
  const [mode, setMode] = useState<Mode>('tonos');
  const [voiceWarn, setVoiceWarn] = useState(false);
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => checkChineseVoice().then((missing) => alive && setVoiceWarn(missing)), 1200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, []);

  // Se practica con palabras ya vistas; al principio, con las primeras del nivel.
  const seen = words.words.filter((w) => p.decks.read[String(w.id)]);

  return (
    <section className="view" aria-labelledby="h-hab">
      <header className="top"><h1 id="h-hab">Habla</h1><CoinCount value={p.rewards.coins} /></header>
      <div className="seg seg2" role="radiogroup" aria-label="Tipo de práctica">
        {(['tonos', 'repetir'] as Mode[]).map((m) => (
          <label key={m}>
            <input type="radio" name="hmode" id={`hm-${m}`} value={m} checked={mode === m} onChange={() => setMode(m)} />
            <span>{m === 'tonos' ? 'Tonos' : 'Repetir frases'}</span>
          </label>
        ))}
      </div>
      {!canSpeak && <p className="warn">Este navegador no puede leer en voz alta. Prueba en Chrome o Safari.</p>}
      {voiceWarn &&
        (canInstallVoice ? (
          <div className="warn">
            <p>Falta la voz en chino en este celular. Instálala para escuchar las palabras y los tonos: en la pantalla que se abre, descarga «Chino (China)» o «Chino mandarín».</p>
            <button type="button" className="btn-line" onClick={installVoice}>Instalar la voz en chino</button>
          </div>
        ) : (
          <p className="warn">No encontré una voz en chino en este dispositivo. Instálala en los ajustes de texto a voz para escuchar bien los tonos.</p>
        ))}
      {mode === 'tonos' ? <Tones seen={seen} all={words.words} /> : <Repeat seen={seen} all={words.words} />}
    </section>
  );
}

type Round = { items: { w: Word; opts: string[] }[]; i: number; score: number; answer: string | null };

function Tones({ seen, all }: { seen: Word[]; all: Word[] }) {
  const [round, setRound] = useState<Round | null>(null);

  const start = () => {
    const eligibleSeen = seen.filter(eligibleForTones);
    const pool = eligibleSeen.length >= 8 ? eligibleSeen : all.filter(eligibleForTones).slice(0, 40);
    const items = shuffle(pool).slice(0, 10).map((w) => ({ w, opts: toneOptions(w.pinyin) }));
    setRound({ items, i: 0, score: 0, answer: null });
    if (items[0]) speak(items[0].w.hanzi, 0.8);
  };

  if (!round) {
    return (
      <div className="panel">
        <p>Escucha una palabra y elige el pinyin con los tonos correctos. Distinguir los tonos de oído es la base para pronunciarlos bien.</p>
        <button type="button" className="btn-primary" onClick={start}>Empezar ronda de 10</button>
      </div>
    );
  }

  if (round.i >= round.items.length) {
    const s = round.score;
    return (
      <div className="panel done">
        <MascotSays
          mood={s >= 8 ? 'feliz' : s >= 5 ? 'animado' : 'listo'}
          phrase={s >= 8 ? PHRASES.genial : s >= 5 ? PHRASES.animo : PHRASES.sinAfan}
        />
        <h2>Acertaste {s} de {round.items.length}</h2>
        <p>
          {s >= 8 ? 'Tu oído para los tonos va muy bien.' : s >= 5 ? 'Vas bien. Repite la ronda para afinar el oído.' : 'Los tonos cuestan al principio. Escucha cada palabra varias veces antes de elegir.'}
        </p>
        <div className="btns"><button type="button" className="btn-primary" onClick={start}>Otra ronda</button></div>
      </div>
    );
  }

  const it = round.items[round.i];
  const answered = round.answer !== null;
  const ok = round.answer === it.w.pinyin;

  const choose = (o: string) => {
    if (answered) return;
    setRound({ ...round, answer: o, score: round.score + (o === it.w.pinyin ? 1 : 0) });
    bump();
  };
  const next = () => {
    const i = round.i + 1;
    setRound({ ...round, i, answer: null });
    if (round.items[i]) speak(round.items[i].w.hanzi, 0.8);
  };

  return (
    <div className="panel">
      <div className="top">
        <span className="note">{round.i + 1} de {round.items.length}</span>
        <span className="note">{plural(round.score, 'acierto', 'aciertos')}</span>
      </div>
      <button type="button" className="play" onClick={() => speak(it.w.hanzi, 0.8)}>
        <IconSpeaker size={28} />Escuchar otra vez
      </button>
      <p className="rates-help">¿Cuál escuchaste?</p>
      <div className="opts">
        {it.opts.map((o) => (
          <button
            key={o}
            type="button"
            className={`opt${answered && o === it.w.pinyin ? ' right' : ''}${answered && o === round.answer && !ok ? ' wrong' : ''}`}
            disabled={answered}
            onClick={() => choose(o)}
          >
            {o}
          </button>
        ))}
      </div>
      {answered && (
        <div className="stack-v center">
          <p className={`fb ${ok ? 'ok' : 'bad'}`}>{ok ? '¡Correcto!' : `Era ${it.w.pinyin}`}</p>
          <p className="hz t-hz" lang="zh-Hans">{it.w.hanzi}</p>
          <p className="note">{it.w.es}</p>
          <button type="button" className="btn-dark" onClick={next}>{round.i + 1 >= round.items.length ? 'Ver resultado' : 'Siguiente'}</button>
        </div>
      )}
    </div>
  );
}

function Repeat({ seen, all }: { seen: Word[]; all: Word[] }) {
  const pool = seen.length >= 5 ? seen : all.slice(0, 20);
  const [current, setCurrent] = useState<Word | null>(null);
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<Comparison | null>(null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const stopRef = useRef<() => void>(() => {});

  const pick = () => {
    if (!pool.length) return;
    let next = pool[Math.floor(Math.random() * pool.length)];
    if (pool.length > 1) while (next.id === current?.id) next = pool[Math.floor(Math.random() * pool.length)];
    setCurrent(next);
    setTyped('');
    setResult(null);
    setError('');
  };

  useEffect(() => {
    if (!current && pool.length) pick();
    return () => stopRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool.length]);

  if (!current) return null;

  const check = async (heard: string) => {
    if (!heard.trim()) {
      setError('Primero di o dicta la frase.');
      return;
    }
    setError('');
    // El diccionario de pinyin pesa; se carga solo al comprobar la primera frase.
    const { compareSpeech } = await import('../lib/compare');
    setResult(compareSpeech(current.ex.zh, heard));
  };

  const listen = () => {
    setError('');
    setListening(true);
    const { promise, stop } = listenOnce();
    stopRef.current = stop;
    promise
      .then((text) => {
        setTyped(text);
        check(text);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setListening(false));
  };

  const msg = result
    ? result.score >= 0.9
      ? ['¡Muy bien! Se entendió la frase.', 'ok']
      : result.score >= 0.6
        ? ['Casi. Repite las partes marcadas.', 'bad']
        : ['No se entendió bien. Escucha otra vez y repite despacio.', 'bad']
    : null;
  const hasTone = result?.parts.some((x) => x.status === 'tone');

  return (
    <div className="stack-v">
      <div className="panel">
        <p className="label">Escucha y repite en voz alta</p>
        <p className="hz s-hz" lang="zh-Hans">{current.ex.zh}</p>
        <p className="s-py">{current.ex.py}</p>
        <p className="note">{current.ex.es}</p>
        {canSpeak && (
          <div className="two">
            <button type="button" className="btn-line" onClick={() => speak(current.ex.zh, 0.85)}>Escuchar</button>
            <button type="button" className="btn-line" onClick={() => speak(current.ex.zh, 0.55)}>Más lento</button>
          </div>
        )}
      </div>

      <div className="panel">
        <b>Comprueba tu pronunciación</b>
        {canListen ? (
          <button type="button" className={`play${listening ? ' rec' : ''}`} onClick={listening ? () => stopRef.current() : listen}>
            <IconMic size={28} />
            {listening ? 'Escuchando… toca para cancelar' : 'Toca y di la frase'}
          </button>
        ) : (
          <p className="note">Tu navegador no reconoce voz. Usa el micrófono del teclado en chino de tu celular para dictar la frase aquí abajo.</p>
        )}
        <label className="note" htmlFor="s-input">{canListen ? 'O dicta o escribe lo que dijiste:' : 'Dicta la frase:'}</label>
        <div className="dict">
          <input
            id="s-input"
            lang="zh-Hans"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Toca aquí y dicta"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && check(typed)}
          />
          <button type="button" className="btn-dark" onClick={() => check(typed)}>Comprobar</button>
        </div>
        {error && <p className="fb bad">{error}</p>}
        {result && msg && (
          <div className="stack-v" style={{ gap: 6 }}>
            <p className="hz s-diff" lang="zh-Hans">
              {result.parts.map((x, i) => (
                <span key={i} className={x.status}>{x.ch}</span>
              ))}
            </p>
            <p className={`fb ${msg[1]}`}>{msg[0]}</p>
            {hasTone && <p className="note">Lo marcado en naranja se entendió con otro tono.</p>}
          </div>
        )}
      </div>
      <button
        type="button"
        className="btn-primary"
        onClick={() => {
          bump();
          pick();
        }}
      >
        Siguiente frase
      </button>
    </div>
  );
}
