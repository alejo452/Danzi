import { useState, type CSSProperties } from 'react';
import { Coin } from '../components/Coin';
import { IconBack, IconCheck, IconLock, IconShield } from '../components/Icons';
import { SealMark } from '../components/SealMark';
import { Sheet } from '../components/Sheet';
import { Wardrobe } from '../components/Wardrobe';
import { fromDayKey, plural } from '../lib/dates';
import { EARN, MAX_SHIELDS, todayLog, type Progress } from '../lib/progress';
import { buyShield, buyTheme, sealStats, SEALS, selectTheme, SHIELD_PRICE, THEMES, type Seal } from '../lib/rewards';
import { useAnimatedNumber } from '../lib/useAnimatedNumber';
import { updateProgress } from '../lib/useProgress';
import type { View } from '../App';

const DATE_FMT = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });

type Props = { p: Progress; go: (v: View) => void };

export function Rewards({ p, go }: Props) {
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  const [detail, setDetail] = useState<Seal | null>(null);
  const coins = useAnimatedNumber(p.rewards.coins);
  const stats = sealStats(p);
  const today = todayLog(p, new Date()).c;
  const got = SEALS.filter((s) => p.rewards.seals[s.id]).length;

  const missingText = (n: number, what: string) => `Te faltan ${plural(n, 'moneda', 'monedas')} para ${what}. Practica un rato y vuelve.`;

  const getShield = () => {
    const r = buyShield(p, new Date());
    if (r.ok) {
      updateProgress(() => r.p);
      setMessage(`Compraste un protector. Tienes ${r.p.rewards.shields} de ${MAX_SHIELDS}.`);
    } else if (r.reason === 'max') setMessage(`Ya tienes ${MAX_SHIELDS} protectores, el máximo.`);
    else setMessage(missingText(r.missing ?? 0, 'un protector'));
  };

  const getTheme = (id: string) => {
    const t = THEMES.find((x) => x.id === id)!;
    const r = buyTheme(p, id, new Date());
    setConfirm(null);
    if (r.ok) {
      updateProgress(() => r.p);
      setMessage(`Compraste el tema ${t.name} y ya lo estás usando.`);
    } else if (r.reason === 'coins') setMessage(missingText(r.missing ?? 0, `el tema ${t.name}`));
  };

  const pickTheme = (id: string) => {
    updateProgress((q) => selectTheme(q, id, new Date()));
    setMessage(`Ahora usas el tema ${THEMES.find((x) => x.id === id)!.name}.`);
  };

  return (
    <section className="view" aria-labelledby="h-premios">
      <button type="button" className="back-link" onClick={() => go('inicio')}><IconBack size={18} />Inicio</button>
      <header className="top"><h1 id="h-premios">Premios</h1></header>

      <section className="panel wallet" aria-label="Tus monedas">
        <Coin size={52} className="coin-spin" />
        <div>
          <p className="wallet-num"><span className="sr">{p.rewards.coins} monedas</span><span aria-hidden="true">{coins}</span></p>
          <p className="note">
            monedas · {today ? `hoy ganaste ${today}` : 'hoy aún no has ganado'} · {plural(stats.earned, 'ganada', 'ganadas')} en total
          </p>
        </div>
      </section>

      <section className="panel" aria-labelledby="h-tienda">
        <h2 className="label" id="h-tienda">Tienda</h2>
        <div className="shop-item">
          <span className="shop-ico" aria-hidden="true"><IconShield size={24} /></span>
          <p className="shop-txt">
            <b>Protector de racha</b>
            <small>Si un día no practicas, tu racha sigue. Se usa solo. Tienes {p.rewards.shields} de {MAX_SHIELDS}.</small>
          </p>
          <button type="button" className="price-btn" disabled={p.rewards.shields >= MAX_SHIELDS} onClick={getShield} aria-label={`Comprar protector de racha por ${SHIELD_PRICE} monedas`}>
            <Coin size={16} />
            {SHIELD_PRICE}
          </button>
        </div>

        <Wardrobe p={p} />

        <h3 className="label">Temas de color</h3>
        <div className="themes">
          {THEMES.map((t) => {
            const owned = p.rewards.themes.includes(t.id);
            const active = p.rewards.theme === t.id;
            return (
              <div key={t.id} className={`theme-card${active ? ' active' : ''}`}>
                <span className={`swatch ${t.id}`} aria-hidden="true" />
                <b>{t.name}</b>
                <small>{t.desc}</small>
                {active ? (
                  <button type="button" className="price-btn ok" disabled>
                    <IconCheck size={16} />
                    En uso
                  </button>
                ) : owned ? (
                  <button type="button" className="price-btn" onClick={() => pickTheme(t.id)}>Usar</button>
                ) : confirm === t.id ? (
                  <div className="two">
                    <button type="button" className="price-btn alt" onClick={() => setConfirm(null)}>No</button>
                    <button type="button" className="price-btn" onClick={() => getTheme(t.id)}>Comprar</button>
                  </div>
                ) : (
                  <button type="button" className="price-btn" onClick={() => setConfirm(t.id)} aria-label={`Comprar el tema ${t.name} por ${t.price} monedas`}>
                    <Coin size={16} />
                    {t.price}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {message && <p className="note" role="status">{message}</p>}
      </section>

      <section className="panel" aria-labelledby="h-sellos">
        <div className="top">
          <h2 className="label" id="h-sellos">Sellos</h2>
          <span className="note">{got} de {SEALS.length}</span>
        </div>
        <div className="seals">
          {SEALS.map((s, i) => {
            const won = !!p.rewards.seals[s.id];
            const value = Math.min(s.value(stats), s.goal);
            return (
              <button key={s.id} type="button" className="seal-btn pop" style={{ '--d': `${i * 0.025}s` } as CSSProperties} onClick={() => setDetail(s)}>
                <SealMark hz={s.hz} locked={!won} />
                <small>{s.name}</small>
                {!won && <small className="prog">{s.goal > 1 ? `${value} de ${s.goal}` : 'Sin ganar'}</small>}
              </button>
            );
          })}
        </div>
      </section>

      <section className="panel" aria-labelledby="h-ganar">
        <h2 className="label" id="h-ganar">Cómo ganar monedas</h2>
        <ul className="earn">
          <li>Cada tarjeta que repasas<b><Coin size={15} />{EARN.card}</b></li>
          <li>Cada palabra nueva<b>+<Coin size={15} />{EARN.newWord}</b></li>
          <li>Cada palabra que escribes<b><Coin size={15} />{EARN.write}</b></li>
          <li>Cada ejercicio de habla<b><Coin size={15} />{EARN.speak}</b></li>
          <li>Sobre rojo al cumplir la meta del día<b><Coin size={15} />10–25</b></li>
          <li>Cada sello nuevo<b><Coin size={15} />10–500</b></li>
        </ul>
        <p className="note">
          Por día cuentan hasta {EARN.cardCap} tarjetas, {EARN.writeCap} palabras escritas y {EARN.speakCap} ejercicios de habla. Las palabras nuevas siempre suman.
        </p>
      </section>

      <Sheet open={!!detail} onClose={() => setDetail(null)} title={detail?.name ?? ''} className="center">
        {detail && (
          <SealDetail seal={detail} won={p.rewards.seals[detail.id]} value={detail.value(stats)} />
        )}
      </Sheet>
    </section>
  );
}

function SealDetail({ seal, won, value }: { seal: Seal; won?: string; value: number }) {
  const ready = !won && value >= seal.goal;
  return (
    <>
      <SealMark hz={seal.hz} big locked={!won} stamp={!!won} />
      <p>{seal.desc}</p>
      {won ? (
        <p className="note">Lo ganaste el {DATE_FMT.format(fromDayKey(won))} y te dio {plural(seal.coins, 'moneda', 'monedas')}.</p>
      ) : ready ? (
        <p className="note">¡Ya lo ganaste! Vuelve a Inicio para recogerlo.</p>
      ) : (
        <>
          <div className="stack" role="img" aria-label={`${Math.min(value, seal.goal)} de ${seal.goal}`} style={{ width: '100%' }}>
            <span className="seg-master" style={{ width: `${(Math.min(value, seal.goal) / seal.goal) * 100}%` }} />
          </div>
          <p className="note">
            <IconLock size={14} /> Llevas {Math.min(value, seal.goal)} de {seal.goal}. Al ganarlo te da {plural(seal.coins, 'moneda', 'monedas')}.
          </p>
        </>
      )}
    </>
  );
}
