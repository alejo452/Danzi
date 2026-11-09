import { useState } from 'react';
import { plural } from '../lib/dates';
import { buyOutfit, OUTFITS, selectOutfit } from '../lib/outfits';
import type { Progress } from '../lib/progress';
import { updateProgress } from '../lib/useProgress';
import { Coin } from './Coin';
import { IconCheck } from './Icons';
import { Sheet } from './Sheet';
import { XiBao } from './XiBao';
import './Wardrobe.css';

/** Probarse un atuendo no lo compra ni cambia el que Xi Bao lleva puesto. */
export function Wardrobe({ p }: { p: Progress }) {
  const [preview, setPreview] = useState(p.rewards.outfit);
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState('');
  const outfit = OUTFITS.find((o) => o.id === preview) ?? OUTFITS[0];
  const owned = p.rewards.outfits.includes(outfit.id);
  const active = p.rewards.outfit === outfit.id;
  const missing = Math.max(0, outfit.price - p.rewards.coins);

  const wear = () => {
    updateProgress((current) => selectOutfit(current, outfit.id, new Date()));
    setMessage(`Xi Bao ya lleva el atuendo ${outfit.name}.`);
  };

  const buy = () => {
    updateProgress((current) => {
      const result = buyOutfit(current, outfit.id, new Date());
      if (result.ok) {
        setConfirm(false);
        setMessage(`Compraste ${outfit.name}. ¡Xi Bao ya lo lleva puesto!`);
        return result.p;
      }
      if (result.reason === 'coins') {
        setMessage(`Te faltan ${plural(result.missing ?? 0, 'moneda', 'monedas')}. Practica un rato y vuelve.`);
      } else {
        setConfirm(false);
        setMessage('Este atuendo ya está en tu armario. Puedes usarlo gratis.');
      }
      return current;
    });
  };

  return (
    <section className="wardrobe" aria-labelledby="h-vestidor">
      <div>
        <h3 className="label" id="h-vestidor">Viste a Xi Bao</h3>
        <p className="note">Un compañero, muchos estilos. Compra con tus monedas y cambia de atuendo cuando quieras.</p>
      </div>

      <div className="wardrobe-preview">
        <div className="wardrobe-stage" role="img" aria-label={`Xi Bao con el atuendo ${outfit.name}`}>
          <XiBao mood="listo" size={144} outfit={outfit.id} />
        </div>
        <div className="wardrobe-info">
          <span className="wardrobe-eyebrow">{active ? 'Así va Xi Bao' : 'Vista previa'}</span>
          <h4>{outfit.name}</h4>
          <p className="note">{outfit.desc}</p>
          {active ? (
            <button type="button" className="price-btn ok" disabled><IconCheck size={16} />En uso</button>
          ) : owned ? (
            <button type="button" className="price-btn" onClick={wear}>Vestir a Xi Bao</button>
          ) : (
            <>
              <button type="button" className="price-btn" disabled={missing > 0} onClick={() => { setMessage(''); setConfirm(true); }} aria-label={`Comprar ${outfit.name} por ${outfit.price} monedas`}>
                Comprar · <Coin size={16} />{outfit.price}
              </button>
              {missing > 0 && <p className="note">Te faltan {plural(missing, 'moneda', 'monedas')}. Sigue practicando para conseguirlas.</p>}
            </>
          )}
        </div>
      </div>

      <div className="wardrobe-grid" role="group" aria-label="Atuendos de Xi Bao">
        {OUTFITS.map((o) => {
          const isOwned = p.rewards.outfits.includes(o.id);
          const isActive = p.rewards.outfit === o.id;
          const status = isActive ? 'En uso' : isOwned ? 'En tu armario' : `${o.price} monedas`;
          return (
            <button key={o.id} type="button" className="wardrobe-option" aria-pressed={outfit.id === o.id} aria-label={`Probar ${o.name}, ${status}`} onClick={() => { setPreview(o.id); setMessage(''); }}>
              <XiBao mood="listo" size={88} outfit={o.id} />
              <b>{o.name}</b>
              <span>{isOwned ? <IconCheck size={14} /> : <Coin size={14} />}{status}</span>
            </button>
          );
        })}
      </div>
      <p className="note wardrobe-message" role="status">{message}</p>
      <p className="note">Lo verás vestido en Inicio y al terminar tus ejercicios. Cada atuendo es tuyo para siempre.</p>

      <Sheet open={confirm} onClose={() => setConfirm(false)} title={`Comprar ${outfit.name}`}>
        <div className="wardrobe-confirm">
          <XiBao mood="feliz" size={132} outfit={outfit.id} />
          <p>El atuendo cuesta <b>{outfit.price} monedas</b> y Xi Bao se lo pondrá de una vez.</p>
          <p className="note">Tienes {p.rewards.coins} monedas.{!missing && ` Te quedarán ${p.rewards.coins - outfit.price}.`}</p>
          {missing > 0 && <p role="status">Te faltan {plural(missing, 'moneda', 'monedas')}.</p>}
          <div className="two">
            <button type="button" className="price-btn alt" onClick={() => setConfirm(false)}>Cancelar</button>
            <button type="button" className="price-btn" disabled={missing > 0 || owned} onClick={buy}>Comprar y vestir</button>
          </div>
        </div>
      </Sheet>
    </section>
  );
}
