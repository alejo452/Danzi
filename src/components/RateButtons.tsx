import { intervalLabel } from '../lib/dates';
import { GRADE_LABEL, GRADES, type Grade, type StoredCard } from '../lib/srs';

type Props = {
  preview: Record<Grade, StoredCard>;
  now: Date;
  onRate: (g: Grade) => void;
  suggested?: Grade;
};

/** Los cuatro botones de respuesta, cada uno con el intervalo en que vuelve la tarjeta. */
export function RateButtons({ preview, now, onRate, suggested }: Props) {
  return (
    <div className="rates">
      {GRADES.map((g) => (
        <button key={g} type="button" className={`rate r${g}${suggested === g ? ' suggested' : ''}`} onClick={() => onRate(g)}>
          <span className="rl">{GRADE_LABEL[g]}</span>
          <span className="ri">{intervalLabel(new Date(preview[g].due), now)}</span>
        </button>
      ))}
    </div>
  );
}
