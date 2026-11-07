import { useEffect, useState, type CSSProperties } from 'react';
import { plural } from '../lib/dates';
import { streak, type Progress } from '../lib/progress';
import { claimSeals, pendingSeals, type Seal } from '../lib/rewards';
import { updateProgress } from '../lib/useProgress';
import { Coin } from './Coin';
import { Confetti } from './Confetti';
import { IconShield } from './Icons';
import { SealMark } from './SealMark';
import { Sheet } from './Sheet';

type Props = {
  p: Progress;
  /** Solo se celebra en Inicio y en Premios, nunca en medio de un repaso. */
  active: boolean;
  /** Días que acaba de salvar un protector (0 si ninguno). */
  shieldsUsed: number;
  onShieldsSeen: () => void;
};

/** Celebra los sellos nuevos y avisa cuando un protector salvó la racha. */
export function Celebrations({ p, active, shieldsUsed, onShieldsSeen }: Props) {
  const [busy, setBusy] = useState(false);
  const [seals, setSeals] = useState<Seal[] | null>(null);
  const pending = pendingSeals(p);

  // Espera a que no haya otra hoja abierta (el calendario, el sobre rojo…).
  useEffect(() => {
    const check = () => setBusy(!!document.querySelector('dialog.sheet[open]:not(.celebration)'));
    check();
    const t = setInterval(check, 1000);
    return () => clearInterval(t);
  }, []);

  const showShields = active && !busy && shieldsUsed > 0;
  useEffect(() => {
    if (active && !busy && !showShields && !seals && pending.length) setSeals(pending);
  }, [active, busy, showShields, seals, pending.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const collect = () => {
    if (!seals) return;
    updateProgress((q) => claimSeals(q, seals.map((s) => s.id), new Date()).p);
    setSeals(null);
  };

  const total = seals?.reduce((sum, s) => sum + s.coins, 0) ?? 0;
  const st = streak(p, new Date());

  return (
    <>
      <Sheet open={showShields} onClose={onShieldsSeen} title="Tu racha está a salvo" className="center" kind="celebration">
        <span className="flame-big shield pop" aria-hidden="true">
          <IconShield size={36} />
        </span>
        <p>
          Un protector cubrió {shieldsUsed === 1 ? 'el día' : `los ${shieldsUsed} días`} que no practicaste. Tu racha sigue en{' '}
          {plural(st, 'día', 'días')}.
        </p>
        <p className="note">
          {p.rewards.shields === 0
            ? 'Ya no te quedan protectores. Puedes comprar otro en Premios.'
            : `Te ${p.rewards.shields === 1 ? 'queda 1 protector' : `quedan ${p.rewards.shields} protectores`}.`}
        </p>
        <button type="button" className="btn-primary" onClick={onShieldsSeen}>Seguir</button>
      </Sheet>

      <Sheet
        open={!!seals && !showShields}
        onClose={collect}
        title={seals && seals.length > 1 ? `¡${seals.length} sellos nuevos!` : '¡Sello nuevo!'}
        className="center"
        kind="celebration"
      >
        {seals && (
          <>
            <Confetti />
            <div className="seal-row">
              {seals.map((s, i) => (
                <div key={s.id} className="seal-btn" style={{ minWidth: 88 }}>
                  <SealMark hz={s.hz} big={seals.length <= 2} stamp delay={0.15 + i * 0.22} />
                  {seals.length > 1 && <small>{s.name}</small>}
                </div>
              ))}
            </div>
            {seals.length === 1 && (
              <div>
                <h3 className="hero-title">{seals[0].name}</h3>
                <p className="note">{seals[0].desc}</p>
              </div>
            )}
            <p className="reward-line pop" style={{ '--d': `${0.4 + seals.length * 0.22}s` } as CSSProperties}>
              <Coin size={26} /> +{plural(total, 'moneda', 'monedas')}
            </p>
            <button type="button" className="btn-primary" onClick={collect}>
              Recoger {plural(total, 'moneda', 'monedas')}
            </button>
          </>
        )}
      </Sheet>
    </>
  );
}
