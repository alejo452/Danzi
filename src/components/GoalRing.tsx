import { useEffect, useState } from 'react';
import { IconCheck } from './Icons';

const R = 30;
const C = 2 * Math.PI * R;

/** Anillo de la meta del día. Se llena al aparecer y se pone verde al cumplirla. */
export function GoalRing({ done, goal }: { done: number; goal: number }) {
  const k = goal ? Math.min(1, done / goal) : 0;
  const reached = done >= goal;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const f = requestAnimationFrame(() => setShown(k));
    return () => cancelAnimationFrame(f);
  }, [k]);
  return (
    <div
      className={`ring${reached ? ' reached' : ''}`}
      role="img"
      aria-label={reached ? `Meta de hoy cumplida: ${done} de ${goal} actividades` : `Meta de hoy: ${done} de ${goal} actividades`}
    >
      <svg viewBox="0 0 74 74" aria-hidden="true">
        <circle className="track" cx="37" cy="37" r={R} />
        <circle className="fill" cx="37" cy="37" r={R} strokeDasharray={C} strokeDashoffset={C * (1 - shown)} />
      </svg>
      <span className="in" aria-hidden="true">
        {reached ? (
          <IconCheck size={26} />
        ) : (
          <>
            {done}
            <small>de {goal}</small>
          </>
        )}
      </span>
    </div>
  );
}
