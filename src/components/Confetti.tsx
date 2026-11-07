import { useMemo, type CSSProperties } from 'react';
import { prefersReducedMotion } from '../lib/useAnimatedNumber';

/** Lluvia de confeti para celebrar. No aparece si el celular pide menos movimiento. */
export function Confetti({ pieces = 36 }: { pieces?: number }) {
  const bits = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => ({
        left: Math.random() * 100,
        x: (Math.random() - 0.5) * 140,
        r: (Math.random() - 0.5) * 900,
        d: Math.random() * 0.5,
        t: 1.5 + Math.random() * 1.3,
        c: (i % 5) + 1,
      })),
    [pieces],
  );
  if (prefersReducedMotion()) return null;
  return (
    <div className="confetti" aria-hidden="true">
      {bits.map((b, i) => (
        <i
          key={i}
          className={`c${b.c}`}
          style={{ left: `${b.left}%`, '--x': `${b.x}px`, '--r': `${b.r}deg`, '--d': `${b.d}s`, '--t': `${b.t}s` } as CSSProperties}
        />
      ))}
    </div>
  );
}
