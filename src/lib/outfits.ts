// Atuendos de Xi Bao. Los ids son parte del progreso guardado: nunca se cambian ni se reutilizan.
import type { Progress } from './progress';
import type { BuyResult } from './rewards';

export const DEFAULT_OUTFIT = 'clasico';
export type OutfitId = 'clasico' | 'explorador' | 'festival' | 'lluvia' | 'pijama';
export type Outfit = { id: OutfitId; name: string; desc: string; price: number };

// Los precios se mantienen estables: la sincronización los usa para descontar una sola compra
// cuando dos dispositivos compran el mismo atuendo sin conexión. Para cambiar precios hay que
// guardar primero el precio pagado por compra y migrar esa regla de sincronización.
export const OUTFITS: Outfit[] = [
  { id: 'clasico', name: 'Clásico', desc: 'Su bufanda de siempre, con el color de tu tema.', price: 0 },
  { id: 'explorador', name: 'Explorador', desc: 'Sombrero y chaleco para descubrir nuevas palabras.', price: 120 },
  { id: 'festival', name: 'Festival', desc: 'Un traje rojo con detalles dorados para celebrar.', price: 180 },
  { id: 'lluvia', name: 'Lluvia', desc: 'Impermeable y gorro para los días lluviosos.', price: 100 },
  { id: 'pijama', name: 'Pijama', desc: 'Pijama y gorrito para un repaso antes de dormir.', price: 80 },
];

export function isOutfitId(id: unknown): id is OutfitId {
  return OUTFITS.some((outfit) => outfit.id === id);
}

/** Compra el atuendo una sola vez y se lo pone a Xi Bao. No altera las monedas ganadas del día. */
export function buyOutfit(p: Progress, id: string, now: Date): BuyResult {
  const outfit = OUTFITS.find((item) => item.id === id);
  if (!outfit) return { ok: false, reason: 'unknown' };
  const r = p.rewards;
  if (r.outfits.includes(id)) return { ok: false, reason: 'owned' };
  if (r.coins < outfit.price) return { ok: false, reason: 'coins', missing: outfit.price - r.coins };
  return {
    ok: true,
    p: {
      ...p,
      rewards: { ...r, coins: r.coins - outfit.price, outfits: [...r.outfits, id], outfit: id },
      updatedAt: now.getTime(),
    },
  };
}

/** Cambiar entre atuendos comprados, incluido el clásico, siempre es gratis. */
export function selectOutfit(p: Progress, id: string, now: Date): Progress {
  if (!isOutfitId(id) || !p.rewards.outfits.includes(id) || p.rewards.outfit === id) return p;
  return { ...p, rewards: { ...p.rewards, outfit: id }, updatedAt: now.getTime() };
}
