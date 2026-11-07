import { useState } from 'react';
import { CoinCount } from '../components/CoinCount';
import { EnvelopeArt, EnvelopeSheet } from '../components/Envelope';
import { GoalRing } from '../components/GoalRing';
import { IconFlame, IconGear, IconMic, IconPencil } from '../components/Icons';
import { Sheet } from '../components/Sheet';
import { StreakCalendar } from '../components/StreakCalendar';
import { LEVELS } from '../data/levels';
import { dayKey, plural } from '../lib/dates';
import { practiced, streak, todayLog, type Progress } from '../lib/progress';
import { forecast, type QueueCounts } from '../lib/queue';
import { canOpenEnvelope, goalProgress } from '../lib/rewards';
import { isLearning, isMature } from '../lib/srs';
import type { WordsState } from '../lib/useWords';
import { deckFor } from '../lib/useWords';
import type { View } from '../App';

type Props = { p: Progress; words: WordsState; read: QueueCounts; write: QueueCounts; go: (v: View) => void };

const DATE_FMT = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
const WD_FMT = new Intl.DateTimeFormat('es-CO', { weekday: 'short' });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Saludo en chino según la hora: 早上好, 下午好 o 晚上好 (todas palabras del HSK 1). */
function greeting(now: Date): { hz: string; py: string; es: string } {
  const h = now.getHours();
  if (h >= 5 && h < 12) return { hz: '早上好', py: 'Zǎoshang hǎo', es: 'Buenos días' };
  if (h >= 12 && h < 18) return { hz: '下午好', py: 'Xiàwǔ hǎo', es: 'Buenas tardes' };
  return { hz: '晚上好', py: 'Wǎnshang hǎo', es: 'Buenas noches' };
}

export function Home({ p, words, read, write, go }: Props) {
  const [sheet, setSheet] = useState<'racha' | 'sobre' | null>(null);
  const now = new Date();
  const st = streak(p, now);
  const tl = todayLog(p, now);
  const doneToday = practiced(p.log[dayKey(now)]);
  const goal = goalProgress(p, now);
  const envelopeReady = canOpenEnvelope(p, now);
  const opened = dayKey(now) in p.rewards.envelopes;
  const hi = greeting(now);
  const levelNames = LEVELS.filter((l) => p.settings.levels.includes(l.id)).map((l) => l.name).join(' · ');

  const activity: string[] = [];
  if (tl.r) activity.push(plural(tl.r, 'repaso', 'repasos'));
  if (tl.w) activity.push(plural(tl.w, 'palabra escrita', 'palabras escritas'));
  if (tl.h) activity.push(plural(tl.h, 'ejercicio de habla', 'ejercicios de habla'));
  const activityText = activity.length
    ? `Hoy llevas ${activity.join(', ').replace(/, ([^,]*)$/, ' y $1')}.`
    : 'Cada tarjeta, palabra escrita o ejercicio de habla cuenta para la meta.';

  const left = goal.goal - goal.done;
  const goalTitle = goal.reached ? '¡Meta cumplida!' : goal.done ? `Te ${left === 1 ? 'falta 1 actividad' : `faltan ${left} actividades`}` : `Meta del día: ${goal.goal}`;
  const goalNote = goal.reached
    ? opened
      ? `Ya abriste tu sobre rojo. Hoy ganaste ${plural(tl.c, 'moneda', 'monedas')}.`
      : 'Tu sobre rojo te espera.'
    : 'Al cumplirla abres un sobre rojo con monedas.';
  const atRisk = st > 0 && !doneToday && now.getHours() >= 17;

  // Progreso por estado
  const readDeck = deckFor(p, 'read', words.byId);
  const c = { master: 0, review: 0, learn: 0, unseen: 0 };
  for (const w of words.words) {
    const card = readDeck[String(w.id)];
    if (!card) c.unseen++;
    else if (isLearning(card)) c.learn++;
    else if (isMature(card)) c.master++;
    else c.review++;
  }
  const total = words.words.length || 1;

  const days = forecast([readDeck, deckFor(p, 'write', words.byId)], 7, now);
  const max = Math.max(...days);

  return (
    <section className="view" aria-labelledby="h-inicio">
      <header className="top">
        <div>
          <p className="eyebrow">{cap(DATE_FMT.format(now))}</p>
          <h1 id="h-inicio">
            <span className="hz greet-hz" lang="zh-Hans">{hi.hz}</span>
          </h1>
        </div>
        <div className="top-r">
          <button
            type="button"
            className={`chip chip-btn streak ${st > 0 ? 'lit' : 'off'}`}
            aria-label={`Racha de ${plural(st, 'día', 'días')}. Ver calendario`}
            onClick={() => setSheet('racha')}
          >
            <IconFlame size={18} />
            {st}
          </button>
          <CoinCount value={p.rewards.coins} onClick={() => go('premios')} />
          <button type="button" className="icon-link" aria-label="Ajustes" onClick={() => go('ajustes')}>
            <IconGear size={20} />
          </button>
        </div>
      </header>
      <p className="greet-sub">
        {hi.py} · {hi.es}
      </p>

      <section className="panel" aria-labelledby="h-hoy">
        <div className="hero-top">
          <GoalRing done={goal.done} goal={goal.goal} />
          <div>
            <h2 className="label" id="h-hoy">Hoy</h2>
            <p className="hero-title">{goalTitle}</p>
            <p className="note">{goalNote}</p>
          </div>
        </div>
        <div className="trio">
          <div><span className="num c-new">{read.newLeft}</span><span className="sub">Nuevas</span></div>
          <div><span className="num c-learn">{read.learn}</span><span className="sub">Aprendiendo</span></div>
          <div><span className="num c-rev">{read.review}</span><span className="sub">Para repasar</span></div>
        </div>
        <button type="button" className={`btn-primary${read.total ? '' : ' is-done'}`} onClick={() => go('repasar')}>
          {read.total ? `Empezar repaso · ${read.total}` : 'Tarjetas al día'}
        </button>
        <p className="note">{activityText}</p>
      </section>

      {envelopeReady && (
        <section className="panel gift" aria-labelledby="h-sobre">
          <EnvelopeArt state="closed" mini />
          <div className="gift-txt">
            <h2 className="hero-title" id="h-sobre">Tu sobre rojo está listo</h2>
            <button type="button" className="btn-primary" onClick={() => setSheet('sobre')}>Abrir sobre rojo</button>
          </div>
        </section>
      )}

      {atRisk && (
        <p className="risk">
          <IconFlame size={20} />
          <span>
            Practica hoy para no perder tu racha de {plural(st, 'día', 'días')}.
            {p.rewards.shields > 0 && ` Si no alcanzas, te ${p.rewards.shields === 1 ? 'cubre tu protector' : 'cubren tus protectores'}.`}
          </span>
        </p>
      )}

      <section className="panel" aria-labelledby="h-mas">
        <h2 className="label" id="h-mas">Más práctica</h2>
        <div className="links">
          <button type="button" onClick={() => go('escribir')}>
            <span className="ico"><IconPencil size={20} /></span>
            <span className="txt"><b>Escritura</b><small>Escribe con el dedo los caracteres que ya viste</small></span>
            <span className="val">{write.total ? `${write.total} hoy` : Object.keys(p.decks.read).length ? 'Al día' : 'Aún no'}</span>
          </button>
          <button type="button" onClick={() => go('hablar')}>
            <span className="ico"><IconMic size={20} /></span>
            <span className="txt"><b>Habla</b><small>Entrena tonos y repite frases en voz alta</small></span>
            <span className="val">{tl.h ? `${tl.h} hoy` : ''}</span>
          </button>
        </div>
      </section>

      <section className="panel" aria-labelledby="h-prog">
        <div className="top">
          <h2 className="label" id="h-prog">Tu progreso · {levelNames}</h2>
          <span className="note">{words.words.length - c.unseen} de {words.words.length}</span>
        </div>
        <div className="stack" role="img" aria-label={`${c.master} dominadas, ${c.review} en repaso, ${c.learn} aprendiendo, ${c.unseen} sin ver`}>
          <span className="seg-master" style={{ width: `${(c.master / total) * 100}%` }} />
          <span className="seg-review" style={{ width: `${(c.review / total) * 100}%` }} />
          <span className="seg-learn" style={{ width: `${(c.learn / total) * 100}%` }} />
        </div>
        <ul className="legend">
          <li><span className="sw master" />Dominadas<b>{c.master}</b></li>
          <li><span className="sw review" />En repaso<b>{c.review}</b></li>
          <li><span className="sw learn" />Aprendiendo<b>{c.learn}</b></li>
          <li><span className="sw unseen" />Sin ver<b>{c.unseen}</b></li>
        </ul>
      </section>

      <section className="panel" aria-labelledby="h-fc">
        <h2 className="label" id="h-fc">Tarjetas de los próximos 7 días</h2>
        <div className="fc" role="img" aria-label={`Tarjetas programadas: ${days.map((n, i) => `${dayLabel(i, now)} ${n}`).join(', ')}`}>
          {days.map((n, i) => (
            <div key={i} className={`col${i === 0 ? ' today' : ''}`}>
              <span className="v">{n || ''}</span>
              <div className="bw"><div className="bar" style={{ height: max ? `${(n / max) * 100}%` : 0 }} /></div>
              <span className="d">{dayLabel(i, now)}</span>
            </div>
          ))}
        </div>
        {max === 0 && <p className="note">Aún no hay repasos programados. Aparecen cuando aprendes tus primeras palabras.</p>}
      </section>

      <Sheet open={sheet === 'racha'} onClose={() => setSheet(null)} title="Tu racha">
        <StreakCalendar
          p={p}
          onShop={() => {
            setSheet(null);
            go('premios');
          }}
        />
      </Sheet>
      <EnvelopeSheet open={sheet === 'sobre'} onClose={() => setSheet(null)} />
    </section>
  );
}

function dayLabel(i: number, now: Date): string {
  if (i === 0) return 'Hoy';
  if (i === 1) return 'Mañ.';
  const d = new Date(now);
  d.setDate(d.getDate() + i);
  return cap(WD_FMT.format(d).replace('.', ''));
}
