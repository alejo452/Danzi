import type { CSSProperties } from 'react';

type Props = { hz: string; locked?: boolean; big?: boolean; stamp?: boolean; delay?: number };

/** Sello rojo chino (印章). Con dos o tres caracteres se escriben en vertical, como en los sellos de verdad. */
export function SealMark({ hz, locked, big, stamp, delay }: Props) {
  const n = Array.from(hz).length;
  const cls = ['seal', n === 2 && 'v2', n >= 3 && 'v3', locked && 'locked', big && 'big', stamp && 'stamp'].filter(Boolean).join(' ');
  return (
    <span className={cls} style={delay ? ({ '--d': `${delay}s` } as CSSProperties) : undefined} lang="zh-Hans" aria-hidden="true">
      {hz}
    </span>
  );
}
