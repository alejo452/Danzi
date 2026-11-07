import { useEffect, useRef, useState, type ReactElement } from 'react';
import { IconBook, IconCards, IconHome, IconMic, IconPencil } from './components/Icons';
import { newLeftToday } from './lib/progress';
import { queueCounts } from './lib/queue';
import { useProgress, useProgressLoaded } from './lib/useProgress';
import { deckFor, newCandidates, useWords } from './lib/useWords';
import { Home } from './views/Home';
import { Review } from './views/Review';
import { Settings } from './views/Settings';
import { Speak } from './views/Speak';
import { Words } from './views/Words';
import { Write } from './views/Write';

export const VIEWS = ['inicio', 'repasar', 'escribir', 'hablar', 'palabras', 'ajustes'] as const;
export type View = (typeof VIEWS)[number];

function viewFromHash(): View {
  const v = location.hash.slice(1) as View;
  return VIEWS.includes(v) ? v : 'inicio';
}

const TABS: { view: View; label: string; Icon: (p: { size?: number }) => ReactElement }[] = [
  { view: 'inicio', label: 'Inicio', Icon: IconHome },
  { view: 'repasar', label: 'Repasar', Icon: IconCards },
  { view: 'escribir', label: 'Escribir', Icon: IconPencil },
  { view: 'hablar', label: 'Hablar', Icon: IconMic },
  { view: 'palabras', label: 'Palabras', Icon: IconBook },
];

export default function App() {
  const p = useProgress();
  const loaded = useProgressLoaded();
  const words = useWords(p.settings.levels);
  const [view, setView] = useState<View>(viewFromHash);
  const main = useRef<HTMLElement>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHash);
    // Refresca los contadores cada minuto y al volver a la app (las tarjetas vencen con el tiempo).
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    const onVis = () => document.visibilityState === 'visible' && setTick((n) => n + 1);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('hashchange', onHash);
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const go = (v: View) => {
    if (location.hash !== `#${v}`) location.hash = v;
    setView(v);
    main.current?.scrollTo(0, 0);
  };

  const now = new Date();
  const read = queueCounts(deckFor(p, 'read', words.byId), newCandidates(p, 'read', words.words), newLeftToday(p, 'read', now), now);
  const write = queueCounts(deckFor(p, 'write', words.byId), newCandidates(p, 'write', words.words), newLeftToday(p, 'write', now), now);
  const badges: Partial<Record<View, number>> = { repasar: read.total, escribir: write.total };

  return (
    <div className="app">
      <main ref={main}>
        {!loaded ? null : view === 'inicio' ? (
          <Home p={p} words={words} read={read} write={write} go={go} />
        ) : view === 'repasar' ? (
          <Review p={p} words={words} counts={read} go={go} />
        ) : view === 'escribir' ? (
          <Write p={p} words={words} counts={write} go={go} />
        ) : view === 'hablar' ? (
          <Speak p={p} words={words} />
        ) : view === 'palabras' ? (
          <Words p={p} words={words} />
        ) : (
          <Settings p={p} go={go} />
        )}
      </main>
      <nav className="tabs" aria-label="Secciones">
        {TABS.map(({ view: v, label, Icon }) => (
          <a
            key={v}
            href={`#${v}`}
            aria-current={view === v ? 'page' : undefined}
            onClick={(e) => {
              e.preventDefault();
              go(v);
            }}
          >
            <Icon size={22} />
            {label}
            {!!badges[v] && <span className="badge">{badges[v]! > 99 ? '99+' : badges[v]}</span>}
          </a>
        ))}
      </nav>
    </div>
  );
}
