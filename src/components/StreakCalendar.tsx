import { useState, type CSSProperties } from 'react';
import { dayKey, fromDayKey, plural } from '../lib/dates';
import { MAX_SHIELDS, practiced, streak, type Progress } from '../lib/progress';
import { bestStreak, dayStatus, firstMonth, monthSummary, monthWeeks, nextStreakSeal, type DayStatus } from '../lib/rewards';
import { IconBack, IconFlame, IconNext, IconShield } from './Icons';
import { SealMark } from './SealMark';

const MONTH_FMT = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' });
const DAY_FMT = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
const WEEKDAYS: [string, string][] = [
  ['L', 'lunes'], ['M', 'martes'], ['M', 'miércoles'], ['J', 'jueves'], ['V', 'viernes'], ['S', 'sábado'], ['D', 'domingo'],
];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const STATUS_TEXT: Record<DayStatus, string> = {
  practiced: 'practicaste',
  shielded: 'lo salvó un protector',
  today: 'hoy, todavía sin práctica',
  missed: 'sin práctica',
  future: 'todavía no llega',
};

type Props = { p: Progress; onShop: () => void };

/** Contenido de la hoja «Tu racha»: racha actual, mejor racha, protectores y el calendario del mes. */
export function StreakCalendar({ p, onShop }: Props) {
  const now = new Date();
  const today = dayKey(now);
  const [ym, setYm] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const first = firstMonth(p, now);
  const idx = (y: number, m: number) => y * 12 + m;
  const canPrev = idx(ym.year, ym.month) > idx(first.year, first.month);
  const canNext = idx(ym.year, ym.month) < idx(now.getFullYear(), now.getMonth());
  const move = (d: number) => {
    const m = ym.month + d;
    setYm({ year: ym.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 });
  };

  const st = streak(p, now);
  const best = Math.max(bestStreak(p), st);
  const sum = monthSummary(p, ym.year, ym.month);
  const doneToday = practiced(p.log[today]);
  const next = nextStreakSeal(p, st);
  const monthName = MONTH_FMT.format(new Date(ym.year, ym.month, 1));
  const weeks = monthWeeks(ym.year, ym.month);
  const covered = (s: DayStatus) => s === 'practiced' || s === 'shielded';

  const status = doneToday
    ? 'Hoy ya practicaste. ¡Sigue así!'
    : st > 0
      ? `Practica hoy para llegar a ${plural(st + 1, 'día', 'días')}.`
      : 'Practica hoy para empezar una racha.';

  let i = 0;
  return (
    <>
      <div className="streak-hero">
        <span className={`flame-big${st > 0 ? '' : ' off'}`} aria-hidden="true">
          <IconFlame size={36} />
        </span>
        <div>
          <p className="streak-num">{plural(st, 'día', 'días')}</p>
          <p className="note">{status}</p>
        </div>
      </div>

      <div className="stats3">
        <div>
          <b>{best}</b>
          <span>Mejor racha</span>
        </div>
        <div>
          <b>{sum.days}</b>
          <span>Días en el mes</span>
        </div>
        <div>
          <b>
            <IconShield size={18} />
            {p.rewards.shields}/{MAX_SHIELDS}
          </b>
          <span>Protectores</span>
        </div>
      </div>

      <div className="cal-head">
        <button type="button" className="icon-link" aria-label="Mes anterior" disabled={!canPrev} onClick={() => move(-1)}>
          <IconBack size={20} />
        </button>
        <h3 aria-live="polite">{cap(monthName)}</h3>
        <button type="button" className="icon-link" aria-label="Mes siguiente" disabled={!canNext} onClick={() => move(1)}>
          <IconNext size={20} />
        </button>
      </div>

      <table className="cal">
        <thead>
          <tr>
            {WEEKDAYS.map(([short, full], k) => (
              <th key={k} scope="col" abbr={full}>
                {short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => {
            const statuses = week.map((d) => dayStatus(p, d.key, today));
            return (
              <tr key={week[0].key}>
                {week.map((d, k) => {
                  const s = statuses[k];
                  const left = k > 0 && covered(statuses[k - 1]) && covered(s);
                  const right = k < 6 && covered(statuses[k + 1]) && covered(s);
                  const run = left && right ? 'run' : left ? 'run run-end' : right ? 'run run-start' : '';
                  return (
                    <td key={d.key} className={run}>
                      <span className={`cal-day ${s}${d.inMonth ? '' : ' out'}`} style={{ '--i': i++ } as CSSProperties}>
                        <span className="sr">
                          {cap(DAY_FMT.format(fromDayKey(d.key)))}: {STATUS_TEXT[s]}
                        </span>
                        <span aria-hidden="true">{d.day}</span>
                        {s === 'shielded' && (
                          <span className="mk" aria-hidden="true">
                            <IconShield size={10} />
                          </span>
                        )}
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      <ul className="cal-legend">
        <li><span className="dot practiced" />Practicaste</li>
        <li><span className="dot shielded" />Protegido</li>
        <li><span className="dot today" />Hoy</li>
      </ul>

      <p className="note">
        {sum.days
          ? `En ${monthName} practicaste ${plural(sum.days, 'día', 'días')} y ganaste ${plural(sum.coins, 'moneda', 'monedas')}.`
          : `En ${monthName} todavía no hay días de práctica.`}
      </p>

      {next && (
        <div className="shop-item">
          <SealMark hz={next.seal.hz} />
          <p className="shop-txt">
            <b>Próximo sello: {next.seal.name}</b>
            <small>
              Te {next.left === 1 ? 'falta 1 día' : `faltan ${next.left} días`} seguidos. Vale {plural(next.seal.coins, 'moneda', 'monedas')}.
            </small>
          </p>
        </div>
      )}

      {p.rewards.shields < MAX_SHIELDS && (
        <button type="button" className="btn-line" onClick={onShop}>
          Conseguir protectores de racha
        </button>
      )}
    </>
  );
}
