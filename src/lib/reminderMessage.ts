// Texto del recordatorio diario. Lo usa el service worker cuando llega la notificación,
// así que se arma con el progreso guardado en el dispositivo en ese momento.
import { LEVELS, levelOfId } from '../data/levelList';
import { endOfToday, plural } from './dates';
import { newLeftToday, streak, todayLog, type Progress } from './progress';

export type ReminderMessage = { title: string; body: string; studiedToday: boolean };

/** Tarjetas de los niveles activos que tocan hoy, contando las atrasadas, en lectura y escritura. */
export function cardsDueToday(p: Progress, now: Date): number {
  const active = new Set(p.settings.levels);
  const end = endOfToday(now).getTime();
  let n = 0;
  for (const deck of [p.decks.read, p.decks.write]) {
    for (const [id, card] of Object.entries(deck)) {
      const level = levelOfId(Number(id));
      if (level && active.has(level) && Date.parse(card.due) < end) n++;
    }
  }
  return n;
}

/** Palabras nuevas que todavía se pueden aprender hoy en los niveles activos. */
export function newWordsLeftToday(p: Progress, now: Date): number {
  const active = new Set(p.settings.levels);
  const total = LEVELS.filter((l) => active.has(l.id)).reduce((sum, l) => sum + l.words, 0);
  const seen = Object.keys(p.decks.read).filter((id) => active.has(levelOfId(Number(id)) ?? '')).length;
  return Math.max(0, Math.min(newLeftToday(p, 'read', now), total - seen));
}

export function reminderMessage(p: Progress, now: Date): ReminderMessage {
  const t = todayLog(p, now);
  const studiedToday = t.r + t.w + t.h > 0;
  const days = streak(p, now);
  const due = cardsDueToday(p, now);
  const fresh = newWordsLeftToday(p, now);

  if (studiedToday) {
    return {
      title: days >= 2 ? `¡Llevas ${days} días seguidos!` : '¡Bien hecho hoy!',
      body: due > 0 ? `Ya practicaste hoy. Si quieres, ${due === 1 ? 'te queda' : 'te quedan'} ${plural(due, 'tarjeta', 'tarjetas')} para repasar.` : 'Ya practicaste hoy. Nos vemos mañana.',
      studiedToday,
    };
  }

  const todo =
    due > 0 && fresh > 0
      ? `Tienes ${plural(due, 'tarjeta', 'tarjetas')} para repasar y ${plural(fresh, 'palabra nueva', 'palabras nuevas')}.`
      : due > 0
        ? `Tienes ${plural(due, 'tarjeta', 'tarjetas')} para repasar.`
        : fresh > 0
          ? `${fresh === 1 ? 'Te espera' : 'Te esperan'} ${plural(fresh, 'palabra nueva', 'palabras nuevas')}.`
          : 'Practica un rato en Escribir o Hablar.';
  return {
    title: days >= 1 ? `No pierdas tu racha de ${plural(days, 'día', 'días')}` : 'Es hora de practicar chino',
    body: days >= 1 ? `${todo} Con unos minutos la mantienes.` : todo,
    studiedToday,
  };
}

/** Título y opciones de la notificación. `scope` es la dirección base de la app (la del service worker). */
export function reminderNotification(m: ReminderMessage, scope: string): { title: string; options: NotificationOptions } {
  return {
    title: m.title,
    options: {
      body: m.body,
      lang: 'es',
      icon: new URL('icon-192.png', scope).href,
      badge: new URL('badge-96.png', scope).href,
      // Con la misma etiqueta, un recordatorio nuevo reemplaza al anterior en lugar de acumularse.
      tag: 'danzi-recordatorio',
      // Si ya practicaste hoy, el aviso llega sin sonido.
      silent: m.studiedToday,
      data: { url: new URL('#repasar', scope).href },
    },
  };
}
