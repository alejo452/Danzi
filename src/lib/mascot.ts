// Lo que dice Xi Bao (喜宝), el panda de Danzi: una frase según cómo va tu día y frases en chino
// para cuando lo tocas. Funciones puras; tests/mascot.test.ts revisa el pinyin de cada frase.
import { dayKey, plural } from './dates';
import { practiced, streak, type Progress } from './progress';
import { canOpenEnvelope, goalProgress } from './rewards';

/** Estado de ánimo de Xi Bao: cambia su cara y su pose (src/components/XiBao.tsx). */
export type Mood = 'hola' | 'listo' | 'animado' | 'feliz' | 'preocupado' | 'dormido';

/** Una frase en chino con su pinyin (con tonos) y su traducción. */
export type Phrase = { zh: string; py: string; es: string };

export type MascotLine = { mood: Mood; phrase: Phrase; text: string };

/** 喜宝: «tesoro alegre». */
export const MASCOT = { name: 'Xi Bao', hz: '喜宝', py: 'Xǐbǎo' } as const;

export const PHRASES = {
  hola: { zh: '你好！我是喜宝。', py: 'Nǐ hǎo! Wǒ shì Xǐbǎo.', es: '¡Hola! Soy Xi Bao.' },
  juntos: { zh: '我们一起学习吧！', py: 'Wǒmen yìqǐ xuéxí ba!', es: '¡Aprendamos juntos!' },
  animo: { zh: '加油！', py: 'Jiāyóu!', es: '¡Ánimo!' },
  genial: { zh: '太棒了！', py: 'Tài bàng le!', es: '¡Excelente!' },
  noTeRindas: { zh: '别放弃！', py: 'Bié fàngqì!', es: '¡No te rindas!' },
  buenasNoches: { zh: '晚安！', py: "Wǎn'ān!", es: '¡Buenas noches!' },
  completado: { zh: '完成！', py: 'Wánchéng!', es: '¡Completado!' },
  completo: { zh: '完成', py: 'wánchéng', es: 'completado' },
  muyBien: { zh: '很好！', py: 'Hěn hǎo!', es: '¡Muy bien!' },
  escribir: { zh: '写', py: 'xiě', es: 'escribir' },
  sinAfan: { zh: '慢慢来。', py: 'Mànmàn lái.', es: 'Sin afán.' },
} satisfies Record<string, Phrase>;

/** Lo que dice Xi Bao cada vez que lo tocas, en este orden. */
export const TAP_PHRASES: Phrase[] = [
  { zh: '加油！', py: 'Jiāyóu!', es: '¡Ánimo, tú puedes!' },
  { zh: '你真棒！', py: 'Nǐ zhēn bàng!', es: '¡Eres lo máximo!' },
  { zh: '慢慢来。', py: 'Mànmàn lái.', es: 'Sin afán, paso a paso.' },
  { zh: '我爱吃竹子。', py: 'Wǒ ài chī zhúzi.', es: 'Me encanta comer bambú.' },
  { zh: '学习很有意思！', py: 'Xuéxí hěn yǒu yìsi!', es: '¡Aprender es muy divertido!' },
  { zh: '你今天学了什么？', py: 'Nǐ jīntiān xué le shénme?', es: '¿Qué aprendiste hoy?' },
  { zh: '我们是好朋友！', py: 'Wǒmen shì hǎo péngyou!', es: '¡Somos buenos amigos!' },
];

const isNight = (now: Date) => now.getHours() >= 21 || now.getHours() < 5;

/**
 * Qué dice Xi Bao en Inicio. `cardsToday` son las tarjetas que tocan hoy en Repasar (con las nuevas).
 * Avisa de la racha en riesgo desde las 5 de la tarde, como hacía el aviso de Inicio.
 */
export function homeLine(p: Progress, now: Date, cardsToday: number): MascotLine {
  const did = practiced(p.log[dayKey(now)]);
  const days = streak(p, now);
  const goal = goalProgress(p, now);

  if (!did && Object.keys(p.decks.read).length === 0) {
    return {
      mood: 'hola',
      phrase: PHRASES.hola,
      text: 'Te acompaño a aprender chino. Empieza por tus primeras palabras en Repasar.',
    };
  }
  if (goal.reached) {
    if (isNight(now)) return { mood: 'dormido', phrase: PHRASES.buenasNoches, text: 'Hoy cumpliste la meta. Descansa, nos vemos mañana.' };
    return {
      mood: 'feliz',
      phrase: PHRASES.genial,
      text: canOpenEnvelope(p, now) ? 'Cumpliste la meta de hoy. ¡Abre tu sobre rojo!' : 'Cumpliste la meta de hoy. ¡Qué bacano!',
    };
  }
  if (did) {
    const left = goal.goal - goal.done;
    return { mood: 'animado', phrase: PHRASES.animo, text: `Vas muy bien: te ${left === 1 ? 'falta 1 actividad' : `faltan ${left} actividades`} para la meta.` };
  }
  if (days > 0 && now.getHours() >= 17) {
    const shields = p.rewards.shields;
    return {
      mood: 'preocupado',
      phrase: PHRASES.noTeRindas,
      text:
        `Practica hoy para no perder tu racha de ${plural(days, 'día', 'días')}.` +
        (shields > 0 ? ` Si no alcanzas, te ${shields === 1 ? 'cubre tu protector' : 'cubren tus protectores'}.` : ''),
    };
  }
  return {
    mood: 'listo',
    phrase: PHRASES.juntos,
    text: cardsToday > 0 ? `¿Repasamos? Tienes ${plural(cardsToday, 'tarjeta', 'tarjetas')} para hoy.` : 'Hoy no tienes tarjetas. Practica la escritura o el habla conmigo.',
  };
}
