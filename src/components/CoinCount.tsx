import { useEffect, useRef, useState } from 'react';
import { useAnimatedNumber } from '../lib/useAnimatedNumber';
import { Coin } from './Coin';

type Props = { value: number; onClick?: () => void };

/** Saldo de monedas. Cuando sube, el número cuenta hacia arriba y aparece «+N». */
export function CoinCount({ value, onClick }: Props) {
  const shown = useAnimatedNumber(value);
  const prev = useRef(value);
  const [gain, setGain] = useState<{ n: number; k: number } | null>(null);

  useEffect(() => {
    const d = value - prev.current;
    prev.current = value;
    if (d > 0) setGain({ n: d, k: Date.now() });
  }, [value]);

  useEffect(() => {
    if (!gain) return;
    const t = setTimeout(() => setGain(null), 1300);
    return () => clearTimeout(t);
  }, [gain]);

  const inner = (
    <>
      <Coin size={18} />
      <span key={gain?.k ?? 0} className={`count${gain ? ' bump' : ''}`} aria-hidden="true">{shown}</span>
      {gain && <span key={`g${gain.k}`} className="gain" aria-hidden="true">+{gain.n}</span>}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className="chip chip-btn coin-chip" aria-label={`${value} monedas. Ver premios`} onClick={onClick}>
        {inner}
      </button>
    );
  }
  return (
    <span className="chip coin-chip">
      <span className="sr">{value} monedas</span>
      {inner}
    </span>
  );
}
