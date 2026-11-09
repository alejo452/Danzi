import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Celebrations } from './components/Celebrations';
import { IconBook, IconCards, IconHome, IconMic, IconPencil } from './components/Icons';
import { Toasts } from './components/Toasts';
import { cloudConfigured, hasStoredSession, setCloudState, useCloudReady } from './lib/cloudConfig';
import { dayKey } from './lib/dates';
import { isNative } from './lib/native';
import { newLeftToday } from './lib/progress';
import { queueCounts } from './lib/queue';
import { applyShields, goalProgress } from './lib/rewards';
import { toast } from './lib/toasts';
import { updateProgress, useProgress, useProgressLoaded } from './lib/useProgress';
import { deckFor, newCandidates, useWords } from './lib/useWords';
import { Home } from './views/Home';
import { Review } from './views/Review';
import { Rewards } from './views/Rewards';
import { Settings } from './views/Settings';
import { Speak } from './views/Speak';
import { Words } from './views/Words';
import { Write } from './views/Write';

export const VIEWS = ['inicio', 'repasar', 'escribir', 'hablar', 'palabras', 'ajustes', 'premios'] as const;
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
  const [shieldsUsed, setShieldsUsed] = useState(0);
  const cloudReady = useCloudReady();
  const today = dayKey(new Date());

  // Al abrir la app (y cada día nuevo), los protectores cubren los días sin práctica justo antes de hoy.
  // Con la sesión iniciada esperan a la primera sincronización: la práctica que falta pudo ser en otro dispositivo.
  useEffect(() => {
    if (!loaded || !cloudReady) return;
    let used = 0;
    updateProgress((q) => {
      const r = applyShields(q, new Date());
      used = r.used;
      return r.used ? r.p : q;
    });
    if (used) setShieldsUsed(used);
  }, [loaded, today, cloudReady]);

  // Con una sesión guardada, sincroniza el progreso con la cuenta (src/lib/cloud.ts, que carga Supabase).
  useEffect(() => {
    if (!cloudConfigured || !hasStoredSession()) return;
    // Si la nube tarda, los protectores no esperan más de 10 segundos.
    const t = setTimeout(() => setCloudState({ ready: true }), 10_000);
    import('./lib/cloud')
      .then((m) => m.startCloud())
      .catch(() => setCloudState({ ready: true }));
    return () => clearTimeout(t);
  }, []);

  // Tema de color comprado en Premios, también en la barra del navegador.
  useEffect(() => {
    document.documentElement.dataset.accent = p.rewards.theme;
    const bar = getComputedStyle(document.documentElement).getPropertyValue('--bar').trim();
    if (bar) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bar);
  }, [p.rewards.theme]);

  // Aviso cuando la meta del día se cumple fuera de Inicio.
  const reached = goalProgress(p, new Date()).reached;
  const wasReached = useRef<{ day: string; reached: boolean } | null>(null);
  useEffect(() => {
    if (!loaded) return;
    const before = wasReached.current;
    wasReached.current = { day: today, reached };
    if (before && before.day === today && !before.reached && reached && view !== 'inicio') {
      toast('¡Cumpliste la meta de hoy! Tu sobre rojo te espera en Inicio.');
    }
  }, [loaded, today, reached, view]);

  // En la APK, el celular programa el recordatorio. Se reprograma cuando cambia el progreso:
  // por ejemplo, si ya practicaste hoy, el aviso de hoy se quita.
  useEffect(() => {
    if (!isNative || !loaded) return;
    import('./native/reminders').then((m) => m.queueSync()).catch(() => undefined);
  }, [loaded, p]);

  // En la APK: confirma que esta versión arrancó bien y busca la versión nueva (src/native/updates.ts).
  // Va al montar la app: si una versión nueva falla antes de llegar aquí, el plugin vuelve a la anterior.
  useEffect(() => {
    if (!isNative) return;
    import('./native/updates').then((m) => m.startUpdates()).catch(() => undefined);
  }, []);

  // En la APK, tocar el aviso abre la vista que indica.
  useEffect(() => {
    if (!isNative) return;
    import('./native/reminders')
      .then((m) => m.listenForTaps((v) => VIEWS.includes(v as View) && (location.hash = v)))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHash);
    // Refresca los contadores cada minuto y al volver a la app (las tarjetas vencen con el tiempo).
    // En la APK, Capacitor avisa con el evento «resume».
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    const onVis = () => document.visibilityState === 'visible' && setTick((n) => n + 1);
    const onResume = () => setTick((n) => n + 1);
    document.addEventListener('visibilitychange', onVis);
    document.addEventListener('resume', onResume);
    return () => {
      window.removeEventListener('hashchange', onHash);
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('resume', onResume);
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
        ) : view === 'premios' ? (
          <Rewards p={p} go={go} />
        ) : (
          <Settings p={p} words={words} go={go} />
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
      <Toasts />
      {loaded && (
        <Celebrations p={p} active={view === 'inicio' || view === 'premios'} shieldsUsed={shieldsUsed} onShieldsSeen={() => setShieldsUsed(0)} />
      )}
    </div>
  );
}
