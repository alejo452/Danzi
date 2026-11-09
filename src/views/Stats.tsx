import { useState } from 'react';
import { ColumnChart, type Column } from '../components/ColumnChart';
import { IconBack } from '../components/Icons';
import { fromDayKey, plural } from '../lib/dates';
import type { Progress } from '../lib/progress';
import {
  activityTotals,
  dailyStats,
  durationLabel,
  estimatedRecall,
  firstTimedDay,
  MIN_REVIEWS,
  percentLabel,
  retention,
  studySeconds,
  TARGET_RETENTION,
  type Retention,
} from '../lib/stats';
import type { View } from '../App';

// Estadísticas (#estadisticas): tiempo de estudio, actividad de cada día y cuánto recuerdas. Los cálculos están en
// src/lib/stats.ts.

/** Días de la gráfica. */
const DAYS = 14;
/** Días para los totales y la retención. */
const MONTH = 30;

const LONG_FMT = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
const SINCE_FMT = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long' });

function joinList(items: string[]): string {
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}` : (items[0] ?? '');
}

function RetentionTile({ title, r }: { title: string; r: Retention }) {
  return (
    <div className="tile">
      <span className="k">{title}</span>
      <span className="v">{r.rate === null ? '—' : percentLabel(r.rate)}</span>
      <span className="s">
        {r.rate !== null
          ? `de ${plural(r.reviews, 'repaso', 'repasos')}`
          : r.reviews
            ? `${r.reviews} de ${MIN_REVIEWS} repasos para calcularla`
            : 'Aún sin repasos'}
      </span>
    </div>
  );
}

export function Stats({ p, go }: { p: Progress; go: (v: View) => void }) {
  const [measure, setMeasure] = useState<'tiempo' | 'actividad'>('tiempo');
  const now = new Date();
  const days = dailyStats(p, now, DAYS);
  const since = firstTimedDay(p);
  const totals = activityTotals(p, now, MONTH);
  const readRet = retention(p, now, MONTH, 'read');
  const writeRet = retention(p, now, MONTH, 'write');
  const readNow = estimatedRecall(p, now, 'read');
  const writeNow = estimatedRecall(p, now, 'write');

  const columns: Column[] = days.map((d, i) => {
    const today = i === days.length - 1;
    const minutes = Math.round(d.seconds / 60);
    const long = today ? `Hoy, ${LONG_FMT.format(d.date)}` : LONG_FMT.format(d.date);
    return measure === 'tiempo'
      ? { key: d.key, label: today ? 'Hoy' : String(d.date.getDate()), long, value: d.seconds, text: durationLabel(d.seconds), short: String(minutes) }
      : { key: d.key, label: today ? 'Hoy' : String(d.date.getDate()), long, value: d.activities, text: plural(d.activities, 'actividad', 'actividades'), short: String(d.activities) };
  });

  const activity = [
    totals.cards && plural(totals.cards, 'tarjeta', 'tarjetas'),
    totals.writing && plural(totals.writing, 'palabra escrita', 'palabras escritas'),
    totals.speaking && plural(totals.speaking, 'ejercicio de habla', 'ejercicios de habla'),
  ].filter((s): s is string => !!s);

  return (
    <section className="view" aria-labelledby="h-est">
      <button type="button" className="back-link" onClick={() => go('inicio')}><IconBack size={18} />Inicio</button>
      <header className="top"><h1 id="h-est">Estadísticas</h1></header>

      <section className="panel" aria-labelledby="h-tiempo">
        <h2 className="label" id="h-tiempo">Tiempo de estudio</h2>
        <div className="tiles">
          <div className="tile"><span className="k">Hoy</span><span className="v">{durationLabel(studySeconds(p, now, 1))}</span></div>
          <div className="tile"><span className="k">7 días</span><span className="v">{durationLabel(studySeconds(p, now, 7))}</span></div>
          <div className="tile"><span className="k">30 días</span><span className="v">{durationLabel(studySeconds(p, now, MONTH))}</span></div>
        </div>
        <div className="seg seg2" role="radiogroup" aria-label="Qué mostrar en la gráfica">
          <label>
            <input type="radio" name="est-medida" checked={measure === 'tiempo'} onChange={() => setMeasure('tiempo')} />
            <span>Minutos</span>
          </label>
          <label>
            <input type="radio" name="est-medida" checked={measure === 'actividad'} onChange={() => setMeasure('actividad')} />
            <span>Actividades</span>
          </label>
        </div>
        <ColumnChart
          key={measure}
          name={measure === 'tiempo' ? `Minutos de estudio de los últimos ${DAYS} días` : `Actividades de los últimos ${DAYS} días`}
          columns={columns}
          table={{
            head: ['Día', 'Tiempo', 'Actividades'],
            rows: days.map((d, i) => [i === days.length - 1 ? 'Hoy' : LONG_FMT.format(d.date), durationLabel(d.seconds), String(d.activities)]),
          }}
        />
        <p className="note">
          {activity.length ? `En los últimos ${MONTH} días: ${joinList(activity)}.` : `No hay actividad en los últimos ${MONTH} días.`}
        </p>
        <p className="note">
          Cuenta desde que aparece cada tarjeta, palabra o ejercicio hasta que respondes, con un tope de 1 minuto por respuesta (2 en escritura),
          como en Anki.{' '}
          {since ? `Se mide desde el ${SINCE_FMT.format(fromDayKey(since))}.` : 'Se empieza a medir con esta versión de Danzi: practica un rato y aparece aquí.'}
        </p>
      </section>

      <section className="panel" aria-labelledby="h-recuerdas">
        <h2 className="label" id="h-recuerdas">Cuánto recuerdas</h2>
        <div className="tiles two">
          <RetentionTile title="Tarjetas" r={readRet} />
          <RetentionTile title="Escritura" r={writeRet} />
        </div>
        <p className="note">
          De las palabras que ya tenías en repaso, cuántas recordaste en los últimos {MONTH} días, sin tocar «Otra vez». Danzi programa los repasos
          para que sea cerca del {percentLabel(TARGET_RETENTION)}: si estás muy por debajo, practica más seguido.
        </p>
        {(readNow.rate !== null || writeNow.rate !== null) && (
          <ul className="recall">
            {readNow.rate !== null && (
              <li>
                Si hoy te preguntaran tus {plural(readNow.words, 'palabra', 'palabras')} en repaso, recordarías cerca del <b>{percentLabel(readNow.rate)}</b>.
              </li>
            )}
            {writeNow.rate !== null && (
              <li>
                De tus {plural(writeNow.words, 'palabra', 'palabras')} en repaso de escritura, recordarías cómo se escriben cerca del{' '}
                <b>{percentLabel(writeNow.rate)}</b>.
              </li>
            )}
          </ul>
        )}
        <p className="note">Esta estimación sale de FSRS, el algoritmo de los repasos, según cuándo repasaste cada palabra.</p>
      </section>
    </section>
  );
}
