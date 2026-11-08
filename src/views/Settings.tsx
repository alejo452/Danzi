import { useEffect, useMemo, useRef, useState } from 'react';
import { IconBack } from '../components/Icons';
import { LocalReminderPanel } from '../components/LocalReminderPanel';
import { ReminderPanel } from '../components/ReminderPanel';
import { isReady, LEVELS } from '../data/levels';
import { dayKey } from '../lib/dates';
import { isNative } from '../lib/native';
import { freshProgress, normalizeProgress, type Progress, type Settings as S } from '../lib/progress';
import { DAILY_GOALS } from '../lib/rewards';
import { charsToWrite, countSavedStrokes } from '../lib/strokes';
import { replaceProgress, updateProgress } from '../lib/useProgress';
import type { WordsState } from '../lib/useWords';
import type { View } from '../App';

/** Revisa si los trazos de los niveles activos ya están guardados para escribir sin internet. */
function useSavedStrokes(words: WordsState) {
  const chars = useMemo(() => charsToWrite(words.words), [words.words]);
  // undefined: revisando; null: el navegador no guarda archivos para usar sin internet.
  const [saved, setSaved] = useState<number | null | undefined>(undefined);
  const [round, setRound] = useState(0);
  const recheck = () => setRound((n) => n + 1);

  useEffect(() => {
    if (words.loading) return;
    // En la APK los trazos vienen dentro de la app: siempre están.
    if (isNative) {
      setSaved(null);
      return;
    }
    let alive = true;
    setSaved(undefined);
    countSavedStrokes(chars).then((n) => alive && setSaved(n));
    return () => {
      alive = false;
    };
  }, [chars, words.loading, round]);

  // Vuelve a revisar cuando el service worker termina de instalarse o se actualiza.
  useEffect(() => {
    const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
    if (!sw) return;
    let alive = true;
    sw.ready.then(() => alive && recheck());
    sw.addEventListener('controllerchange', recheck);
    return () => {
      alive = false;
      sw.removeEventListener('controllerchange', recheck);
    };
  }, []);

  return { total: chars.length, saved, recheck };
}

export function Settings({ p, words, go }: { p: Progress; words: WordsState; go: (v: View) => void }) {
  const offline = useSavedStrokes(words);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pendingImport, setPendingImport] = useState<Progress | null>(null);
  const [message, setMessage] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (patch: Partial<S>) => updateProgress((q) => ({ ...q, settings: { ...q.settings, ...patch }, updatedAt: Date.now() }));

  const toggleLevel = (id: string, on: boolean) => {
    const levels = LEVELS.map((l) => l.id).filter((l) => (l === id ? on : p.settings.levels.includes(l)));
    if (levels.length) set({ levels });
  };

  const exportProgress = async () => {
    const name = `danzi-progreso-${dayKey()}.json`;
    const json = JSON.stringify(p, null, 1);
    if (isNative) {
      // En la APK se abre el diálogo «Guardar en…» de Android (Descargas, Google Drive, etc.).
      setMessage('');
      try {
        if (await (await import('../native/files')).saveTextFile(name, json)) setMessage('Archivo de progreso guardado.');
      } catch {
        setMessage('No se pudo guardar el archivo. Vuelve a intentarlo y elige otra carpeta.');
      }
      return;
    }
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setMessage('Archivo de progreso descargado.');
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data || typeof data !== 'object' || !('decks' in data)) throw new Error();
      setPendingImport(normalizeProgress(data));
      setMessage('');
    } catch {
      setMessage('Ese archivo no es un progreso de Danzi.');
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const seg = (name: string, values: number[], value: number, onChange: (n: number) => void) => (
    <div className="seg">
      {values.map((v) => (
        <label key={v}>
          <input type="radio" name={name} id={`${name}-${v}`} value={v} checked={value === v} onChange={() => onChange(v)} />
          <span>{v}</span>
        </label>
      ))}
    </div>
  );

  return (
    <section className="view" aria-labelledby="h-aj">
      <button type="button" className="back-link" onClick={() => go('inicio')}><IconBack size={18} />Inicio</button>
      <header className="top"><h1 id="h-aj">Ajustes</h1></header>

      <section className="panel">
        <fieldset>
          <legend>Niveles que estudias</legend>
          {LEVELS.map((l) => {
            const ready = isReady(l.id);
            return (
              <label key={l.id} className="row" htmlFor={`lvl-${l.id}`}>
                <span>
                  {l.name}
                  <small>{ready ? `${l.words} palabras nuevas` : 'Próximamente'}</small>
                </span>
                <input type="checkbox" id={`lvl-${l.id}`} disabled={!ready} checked={p.settings.levels.includes(l.id)} onChange={(e) => toggleLevel(l.id, e.target.checked)} />
              </label>
            );
          })}
        </fieldset>
      </section>

      {isNative ? <LocalReminderPanel /> : <ReminderPanel />}

      <section className="panel">
        <fieldset>
          <legend>Meta diaria</legend>
          {seg('goal', DAILY_GOALS, p.settings.dailyGoal, (n) => set({ dailyGoal: n }))}
          <p className="note">Actividades por día para abrir el sobre rojo: tarjetas, palabras escritas y ejercicios de habla.</p>
        </fieldset>
        <fieldset>
          <legend>Palabras nuevas por día</legend>
          {seg('npd', [5, 10, 15, 20], p.settings.newPerDay, (n) => set({ newPerDay: n }))}
        </fieldset>
        <fieldset>
          <legend>Palabras nuevas para escribir por día</legend>
          {seg('nwd', [3, 5, 8, 10], p.settings.newWritePerDay, (n) => set({ newWritePerDay: n }))}
        </fieldset>
        <label className="row" htmlFor="opt-speak">
          <span>Leer en voz alta al voltear<small>Usa la voz en chino de tu dispositivo</small></span>
          <input type="checkbox" id="opt-speak" checked={p.settings.autoSpeak} onChange={(e) => set({ autoSpeak: e.target.checked })} />
        </label>
        <label className="row" htmlFor="opt-py">
          <span>Pinyin en el frente<small>Útil al principio; quítalo cuando reconozcas los caracteres</small></span>
          <input type="checkbox" id="opt-py" checked={p.settings.pinyinFront} onChange={(e) => set({ pinyinFront: e.target.checked })} />
        </label>
      </section>

      {offline.saved !== null && (
        <section className="panel">
          <h2 className="label">Escritura sin internet</h2>
          {offline.saved === undefined ? (
            <p className="note" role="status">Revisando los trazos guardados…</p>
          ) : offline.saved >= offline.total ? (
            <p className="note" role="status">Lista. Los trazos de los {offline.total} caracteres de tus niveles están guardados en este dispositivo.</p>
          ) : (
            <>
              <p className="note" role="status">
                Faltan los trazos de {offline.total - offline.saved} de {offline.total} caracteres. Abre la app con internet y espera un momento a que se descarguen.
              </p>
              <button type="button" className="btn-line" onClick={offline.recheck}>Revisar otra vez</button>
            </>
          )}
        </section>
      )}

      <section className="panel">
        <h2 className="label">Tu progreso</h2>
        <p className="note">Se guarda en este dispositivo. Para pasarlo a otro, descárgalo aquí y cárgalo allá.</p>
        <div className="two">
          <button type="button" className="btn-line" onClick={exportProgress}>Descargar</button>
          <button type="button" className="btn-line" onClick={() => fileRef.current?.click()}>Cargar archivo</button>
        </div>
        {/* En la APK no se filtra por tipo: Android a veces guarda el archivo con otro tipo y lo escondería. */}
        <input ref={fileRef} type="file" accept={isNative ? undefined : 'application/json,.json'} hidden onChange={(e) => onFile(e.target.files?.[0])} />
        {pendingImport && (
          <div className="confirm">
            <p>Esto reemplaza tu progreso actual en este dispositivo por el del archivo.</p>
            <div className="two">
              <button type="button" className="btn-line" onClick={() => setPendingImport(null)}>Cancelar</button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  replaceProgress({ ...pendingImport, updatedAt: Date.now() });
                  setPendingImport(null);
                  setMessage('Progreso cargado.');
                }}
              >
                Reemplazar
              </button>
            </div>
          </div>
        )}
        {message && <p className="note" role="status">{message}</p>}
        {!confirmReset ? (
          <button type="button" className="btn-line danger" onClick={() => setConfirmReset(true)}>Borrar mi progreso</button>
        ) : (
          <div className="confirm">
            <p>Se borran las tarjetas, la escritura, la racha, el historial, las monedas, los sellos y los temas comprados. No se puede deshacer.</p>
            <div className="two">
              <button type="button" className="btn-line" onClick={() => setConfirmReset(false)}>Cancelar</button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  replaceProgress({ ...freshProgress(), settings: p.settings, updatedAt: Date.now() });
                  setConfirmReset(false);
                }}
              >
                Sí, borrar
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="panel prose">
        <h2 className="label">Cómo funciona</h2>
        <p>El repaso usa FSRS, el algoritmo de repetición espaciada de Anki. Cada palabra nueva pasa por dos pasos cortos, a 1 y a 10 minutos; después vuelve justo antes de que la olvides, a intervalos cada vez más largos.</p>
        <p>La escritura lleva su propio repaso y solo incluye palabras que ya viste en las tarjetas.</p>
        <p className="note">Vocabulario: 《HSK考试大纲》 (2025), Centro de Educación y Cooperación Lingüística. Trazos: Hanzi Writer y Make Me a Hanzi. Significados y ejemplos en español escritos para esta app.</p>
      </section>
    </section>
  );
}
