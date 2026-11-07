import { useEffect, useState, type CSSProperties } from 'react';
import { plural } from '../lib/dates';
import { openEnvelope } from '../lib/rewards';
import { updateProgress } from '../lib/useProgress';
import { Coin } from './Coin';
import { Confetti } from './Confetti';
import { Sheet } from './Sheet';

// Hacia dónde salen volando las monedas al abrir el sobre.
const BURST = [
  { x: -96, y: -64, r: -140 }, { x: -64, y: -118, r: 90 }, { x: -22, y: -140, r: -60 }, { x: 24, y: -134, r: 150 },
  { x: 66, y: -110, r: -90 }, { x: 100, y: -58, r: 70 }, { x: -108, y: -14, r: 110 }, { x: 110, y: -10, r: -130 },
];

type ArtProps = { state: 'closed' | 'open' | 'idle'; mini?: boolean; amount?: number };

/** Sobre rojo (红包) con 福, «buena suerte». */
export function EnvelopeArt({ state, mini, amount }: ArtProps) {
  return (
    <div className={`env${mini ? ' mini' : ''} ${state}`} aria-hidden="true">
      <div className="env-back" />
      {!mini && (
        <div className="env-card">
          <Coin size={24} />
          {amount ? `+${amount}` : ''}
        </div>
      )}
      <div className="env-front">
        <span className="env-fu" lang="zh-Hans">福</span>
      </div>
      <div className="env-flap" />
      {state === 'open' && !mini && (
        <div className="burst">
          {BURST.map((b, i) => (
            <i key={i} style={{ '--x': `${b.x}px`, '--y': `${b.y}px`, '--r': `${b.r}deg` } as CSSProperties}>
              <Coin size={18} />
            </i>
          ))}
        </div>
      )}
    </div>
  );
}

/** Hoja para abrir el sobre rojo del día. Las monedas se suman al abrirlo. */
export function EnvelopeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [stage, setStage] = useState<'closed' | 'open' | 'empty'>('closed');
  const [amount, setAmount] = useState(0);

  useEffect(() => {
    if (open) {
      setStage('closed');
      setAmount(0);
    }
  }, [open]);

  const doOpen = () => {
    if (stage !== 'closed') return;
    let got = 0;
    updateProgress((q) => {
      const r = openEnvelope(q, new Date());
      got = r.amount;
      return r.p;
    });
    setAmount(got);
    setStage(got ? 'open' : 'empty');
  };

  return (
    <Sheet open={open} onClose={onClose} title="Tu sobre rojo" className="center">
      {stage === 'open' && <Confetti />}
      <button type="button" className="env-tap" onClick={doOpen} disabled={stage !== 'closed'} aria-label="Abrir el sobre rojo">
        <EnvelopeArt state={stage === 'closed' ? 'closed' : 'open'} amount={amount} />
      </button>
      {stage === 'closed' && (
        <>
          <p>
            En China se regalan sobres rojos (<span lang="zh-Hans">红包</span>, hóngbāo) con dinero, para la buena suerte. Este es tu premio por cumplir la meta de hoy.
          </p>
          <button type="button" className="btn-primary" onClick={doOpen}>Abrir sobre rojo</button>
        </>
      )}
      {stage === 'open' && (
        <>
          <p className="reward-line pop" style={{ '--d': '.55s' } as CSSProperties}>
            <Coin size={26} /> +{plural(amount, 'moneda', 'monedas')}
          </p>
          <p className="pop" style={{ '--d': '.7s' } as CSSProperties}>Cada día que cumplas la meta te espera un sobre nuevo.</p>
          <button type="button" className="btn-primary" onClick={onClose}>Guardar monedas</button>
        </>
      )}
      {stage === 'empty' && (
        <>
          <p>Ya abriste el sobre rojo de hoy. Cumple la meta mañana y te espera otro.</p>
          <button type="button" className="btn-line" onClick={onClose}>Cerrar</button>
        </>
      )}
    </Sheet>
  );
}
