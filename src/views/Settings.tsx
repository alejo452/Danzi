import { useRef, useState } from 'react';
import { IconBack } from '../components/Icons';
import { isReady, LEVELS } from '../data/levels';
import { dayKey } from '../lib/dates';
import { freshProgress, normalizeProgress, type Progress, type Settings as S } from '../lib/progress';
import { replaceProgress, updateProgress } from '../lib/useProgress';
import type { View } from '../App';

export function Settings({ p, go }: { p: Progress; go: (v: View) => void }) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [pendingImport, setPendingImport] = useState<Progress | null>(null);
  const [message, setMessage] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (patch: Partial<S>) => updateProgress((q) => ({ ...q, settings: { ...q.settings, ...patch }, updatedAt: Date.now() }));

  const toggleLevel = (id: string, on: boolean) => {
    const levels = LEVELS.map((l) => l.id).filter((l) => (l === id ? on : p.settings.levels.includes(l)));
    if (levels.length) set({ levels });
  };

  const exportProgress = () => {
    const blob = new Blob([JSON.stringify(p, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `danzi-progreso-${dayKey()}.json`;
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

      <section className="panel">
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

      <section className="panel">
        <h2 className="label">Tu progreso</h2>
        <p className="note">Se guarda en este dispositivo. Para pasarlo a otro, descárgalo aquí y cárgalo allá.</p>
        <div className="two">
          <button type="button" className="btn-line" onClick={exportProgress}>Descargar</button>
          <button type="button" className="btn-line" onClick={() => fileRef.current?.click()}>Cargar archivo</button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
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
            <p>Se borran las tarjetas, la escritura, la racha y el historial. No se puede deshacer.</p>
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
