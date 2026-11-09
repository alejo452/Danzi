import { useState } from 'react';

// Columnas de una sola serie (por ejemplo, minutos por día). Las barras van en gris y la elegida en el color del
// tema; arriba se lee su valor completo. Tocar, pasar el puntero o enfocar una columna la elige (por defecto, la
// última: hoy). Solo se rotula el máximo, para no llenar todo de números; el resto está en la lectura y en la tabla.

export type Column = {
  key: string;
  /** Debajo de la columna, corto: «9» u «Hoy». */
  label: string;
  /** Completo, para la lectura y los lectores de pantalla: «lunes 9 de noviembre». */
  long: string;
  value: number;
  /** El valor con su unidad: «12 min». */
  text: string;
  /** El valor sin unidad, para rotular el máximo: «12». */
  short: string;
};

type Props = {
  /** Qué muestra, para los lectores de pantalla: «Minutos de estudio por día». */
  name: string;
  columns: Column[];
  /** Los encabezados y las columnas de la tabla, para leerla sin gráfica. */
  table: { head: string[]; rows: string[][] };
};

export function ColumnChart({ name, columns, table }: Props) {
  const [sel, setSel] = useState(columns.length - 1);
  const [asTable, setAsTable] = useState(false);
  const max = Math.max(0, ...columns.map((c) => c.value));
  const maxAt = max > 0 ? columns.findIndex((c) => c.value === max) : -1;
  const current = columns[Math.min(sel, columns.length - 1)];

  return (
    <figure className="chart">
      {asTable ? (
        <table className="data-table">
          <caption className="sr-only">{name}</caption>
          <thead>
            <tr>{table.head.map((h, i) => <th key={h} scope="col" className={i ? 'n' : undefined}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {table.rows.map((r) => (
              <tr key={r[0]}>{r.map((v, i) => (i ? <td key={i} className="n">{v}</td> : <th key={i} scope="row">{v}</th>))}</tr>
            ))}
          </tbody>
        </table>
      ) : (
        <>
          <p className="chart-read">
            <b>{current.text}</b>
            <span>{current.long}</span>
          </p>
          <div className="cols" role="group" aria-label={name}>
            {columns.map((c, i) => (
              <button
                key={c.key}
                type="button"
                aria-pressed={i === sel}
                aria-label={`${c.long}: ${c.text}`}
                onClick={() => setSel(i)}
                onPointerEnter={() => setSel(i)}
                onFocus={() => setSel(i)}
              >
                <span className="mx" aria-hidden="true">{i === maxAt ? c.short : ''}</span>
                <span className="bw" aria-hidden="true">
                  <span className="bar" style={{ height: max ? `${(c.value / max) * 100}%` : 0 }} />
                </span>
                <span className="d" aria-hidden="true">{c.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <button type="button" className="link-btn" onClick={() => setAsTable(!asTable)}>
        {asTable ? 'Ver como gráfica' : 'Ver como tabla'}
      </button>
    </figure>
  );
}
