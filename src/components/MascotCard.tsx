import { useState } from 'react';
import { TAP_PHRASES, type MascotLine, type Mood, type Phrase } from '../lib/mascot';
import { canSpeak, speak } from '../lib/speech';
import { XiBao } from './XiBao';

/**
 * Xi Bao en Inicio: dice algo según cómo va tu día. Cada vez que lo tocas da un saltico y dice
 * una frase en chino, que también lee en voz alta.
 */
export function MascotCard({ line }: { line: MascotLine }) {
  const [taps, setTaps] = useState(0);
  const tapped = taps > 0;
  const phrase = tapped ? TAP_PHRASES[(taps - 1) % TAP_PHRASES.length] : line.phrase;

  const tap = () => {
    if (canSpeak) speak(TAP_PHRASES[taps % TAP_PHRASES.length].zh, 0.85);
    setTaps((n) => n + 1);
  };

  return (
    <div className="xb-card">
      <button
        type="button"
        className="xb-tap"
        onClick={tap}
        aria-label={canSpeak ? 'Toca a Xi Bao para escuchar una frase en chino' : 'Toca a Xi Bao para ver otra frase en chino'}
      >
        {/* La key reinicia el saltico en cada toque. */}
        <XiBao key={taps} mood={tapped ? 'animado' : line.mood} size={92} className={tapped ? 'xb-hop' : ''} />
      </button>
      <div className="xb-bubble" aria-live="polite">
        <p className="xb-zh" lang="zh-Hans">{phrase.zh}</p>
        <p className="xb-py">{phrase.py}</p>
        <p className="xb-es">{tapped ? phrase.es : `${phrase.es} ${line.text}`}</p>
      </div>
    </div>
  );
}

/** Xi Bao con una frase corta debajo, para las pantallas de «listo». */
export function MascotSays({ mood, phrase, size = 112 }: { mood: Mood; phrase: Phrase; size?: number }) {
  return (
    <div className="xb-says">
      <XiBao mood={mood} size={size} />
      <p className="xb-pill">
        <span className="hz" lang="zh-Hans">{phrase.zh}</span>
        <span className="xb-pill-py">
          {phrase.py} · {phrase.es}
        </span>
      </p>
    </div>
  );
}
