import { useEffect, useMemo, useRef, useState } from 'react';
import { CoinCount } from '../components/CoinCount';
import { IconBack, IconCamera, IconSpeaker } from '../components/Icons';
import { MascotSays } from '../components/MascotCard';
import type { Word } from '../data/levels';
import { plural } from '../lib/dates';
import { PHRASES } from '../lib/mascot';
import { isNative } from '../lib/native';
import { checkPaper, paperPool, pickPaperWord, type PaperCheck } from '../lib/paper';
import { ANSWER_CAP_S, answerSeconds, EARN, paperCoinsLeft, recordPaper, type Progress } from '../lib/progress';
import { canSpeak, speak } from '../lib/speech';
import { getProgress, updateProgress } from '../lib/useProgress';
import type { WordsState } from '../lib/useWords';
import type { View } from '../App';

// Escritura en papel (#papel, solo en la APK): Danzi pide una palabra que ya estudias, la escribes a mano en un papel y
// le tomas una foto. Si en la foto está la palabra, cuenta como actividad y, si la escribiste de memoria, da monedas
// (con tope diario). La lógica está en src/lib/paper.ts y recordPaper (src/lib/progress.ts).

type Result =
  | { kind: 'bien'; coins: number; fromMemory: boolean }
  | { kind: 'mal'; check: Exclude<PaperCheck, { ok: true }> }
  | { kind: 'error'; message: string };

/** Cuántas palabras recientes no se repiten. */
const RECENT = 10;

function problem(check: Exclude<PaperCheck, { ok: true }>): string {
  switch (check.reason) {
    case 'vacia':
      return 'No encontramos letras chinas en la foto. Escribe más grande, con esfero o marcador oscuro, y toma la foto de cerca y con buena luz.';
    case 'mucho':
      return 'La foto tiene mucho texto. Escribe solo esta palabra en un papel en blanco y tómale la foto de cerca.';
    case 'otra':
      return `Danzi leyó «${check.read}», que no es la palabra. Revisa tu letra y toma otra foto: Danzi lee mejor los caracteres grandes, con los trazos separados.`;
  }
}

export function Paper({ p, words, go }: { p: Progress; words: WordsState; go: (v: View) => void }) {
  const pool = useMemo(() => paperPool(p, words.words), [p, words.words]);
  const [word, setWord] = useState<Word | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const recent = useRef<number[]>([]);
  const shownAt = useRef(Date.now());

  const next = () => {
    const w = pickPaperWord(pool, recent.current);
    if (w) recent.current = [...recent.current, w.id].slice(-RECENT);
    setWord(w);
    setRevealed(false);
    setResult(null);
    shownAt.current = Date.now();
  };

  useEffect(() => {
    if (!word && pool.length) next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool.length]);

  // El lector de chino lo descarga el celular la primera vez: se pide de una vez para no esperar en la foto.
  useEffect(() => {
    if (isNative) import('../native/ocr').then((m) => m.prepareReader()).catch(() => undefined);
  }, []);

  const back = (
    <button type="button" className="back-link" onClick={() => go('inicio')}><IconBack size={18} />Inicio</button>
  );
  const header = (
    <header className="top"><h1 id="h-papel">Escritura en papel</h1><CoinCount value={p.rewards.coins} /></header>
  );

  if (!isNative) {
    return (
      <section className="view" aria-labelledby="h-papel">
        {back}
        {header}
        <div className="panel done">
          <h2>Solo en la app de Android</h2>
          <p>Este ejercicio usa la cámara del celular para leer lo que escribes en papel. Está en la APK de Danzi.</p>
          <div className="btns"><button type="button" className="btn-line" onClick={() => go('inicio')}>Volver a Inicio</button></div>
        </div>
      </section>
    );
  }

  if (words.loading) return <section className="view" aria-labelledby="h-papel">{back}{header}</section>;

  if (!word) {
    return (
      <section className="view" aria-labelledby="h-papel">
        {back}
        {header}
        <div className="panel done">
          <MascotSays mood="listo" phrase={PHRASES.escribir} />
          <h2>Aún no hay palabras para escribir</h2>
          <p>Aprende tus primeras palabras en Repasar y Danzi te las pedirá aquí para que las escribas en papel.</p>
          <div className="btns"><button type="button" className="btn-primary" onClick={() => go('repasar')}>Ir a Repasar</button></div>
        </div>
      </section>
    );
  }

  const coinsLeft = paperCoinsLeft(p, new Date());

  const takePhoto = async () => {
    setBusy(true);
    setResult(null);
    const read = await import('../native/ocr')
      .then((m) => m.readPhoto('camara', () => setReading(true), 'papel'))
      .catch(() => ({ error: 'No se pudo abrir la cámara. Cierra Danzi, ábrela de nuevo y vuelve a intentarlo.' }));
    setBusy(false);
    setReading(false);
    if (!read) return;
    if ('error' in read) {
      setResult({ kind: 'error', message: read.error });
      return;
    }
    const check = checkPaper(word.hanzi, read.text);
    if (!check.ok) {
      setResult({ kind: 'mal', check });
      return;
    }
    const now = new Date();
    const fromMemory = !revealed;
    const coins = fromMemory && paperCoinsLeft(getProgress(), now) > 0 ? EARN.paper : 0;
    const seconds = answerSeconds(shownAt.current, now.getTime(), ANSWER_CAP_S.paper);
    updateProgress((q) => recordPaper(q, now, seconds, fromMemory));
    setResult({ kind: 'bien', coins, fromMemory });
  };

  if (result?.kind === 'bien') {
    return (
      <section className="view" aria-labelledby="h-papel">
        {back}
        {header}
        <div className="panel done" role="status">
          <MascotSays mood="feliz" phrase={PHRASES.muyBien} />
          <h2>¡Bien escrito!</h2>
          <p className="hz pp-hz" lang="zh-Hans">{word.hanzi}</p>
          <p>
            {result.coins
              ? `Ganaste ${plural(result.coins, 'moneda', 'monedas')}.`
              : result.fromMemory
                ? 'Ya ganaste las monedas de hoy en este ejercicio, pero la palabra cuenta para tu meta.'
                : 'Como viste cómo se escribe, esta palabra no da monedas, pero cuenta para tu meta.'}
          </p>
          <div className="btns"><button type="button" className="btn-primary" onClick={next}>Siguiente palabra</button></div>
        </div>
      </section>
    );
  }

  return (
    <section className="view" aria-labelledby="h-papel">
      {back}
      {header}
      <p className="note">
        Escribe a mano en un papel la palabra que te pide Danzi y tómale una foto. Si la escribes de memoria y Danzi la lee
        bien, ganas {plural(EARN.paper, 'moneda', 'monedas')}.{' '}
        {coinsLeft
          ? `Hoy te ${coinsLeft === 1 ? 'queda 1 palabra' : `quedan ${coinsLeft} palabras`} con monedas.`
          : 'Ya ganaste las monedas de hoy en este ejercicio: puedes seguir practicando para tu meta.'}
      </p>
      <div className="session">
        <div className="panel wprompt">
          <p className="f-py">{word.pinyin}</p>
          <p className="f-es">{word.es}</p>
          {revealed && (
            <>
              <p className="hz pp-hz" lang="zh-Hans">{word.hanzi}</p>
              <p className="note">Cópiala en el papel y tómale la foto. Así ya no da monedas, pero cuenta para tu meta.</p>
            </>
          )}
        </div>
        <div className="wtools">
          {canSpeak && (
            <button type="button" className="ghost" onClick={() => speak(word.hanzi, 0.8)}>
              <IconSpeaker size={18} />Escuchar
            </button>
          )}
          {!revealed && (
            <button type="button" className="ghost" disabled={busy} onClick={() => setRevealed(true)}>Ver cómo se escribe</button>
          )}
          <button type="button" className="ghost" disabled={busy} onClick={next}>Otra palabra</button>
        </div>
        <button type="button" className="btn-primary" disabled={busy} onClick={takePhoto}>
          <IconCamera size={20} />
          {result ? 'Tomar otra foto' : 'Tomar foto'}
        </button>
        <div role="status">
          {reading ? (
            <p className="note">Leyendo tu letra…</p>
          ) : result?.kind === 'mal' ? (
            <p className="warn">{problem(result.check)}</p>
          ) : result?.kind === 'error' ? (
            <p className="warn">{result.message}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
