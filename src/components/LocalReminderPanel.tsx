import { useEffect, useState } from 'react';
import { addDays, dayKey } from '../lib/dates';
import { normalizeLocalReminder, type LocalReminder } from '../lib/localReminders';
import { hourLabel } from '../lib/reminderCode';
import type { NotificationPermission } from '../native/reminders';

// Recordatorio diario en la APK de Android: lo programa el propio celular, sin GitHub ni internet.
// La versión web usa ReminderPanel (avisos que manda GitHub).

const native = () => import('../native/reminders');

type State = {
  /** null: el recordatorio está apagado. */
  reminder: LocalReminder | null;
  permission: NotificationPermission;
  next: Date | null;
  exact: boolean;
};

/** "hoy a las 7:43 a. m.", "mañana a las…", "el lunes 10 de noviembre a las…". */
function nextLabel(at: Date, now = new Date()): string {
  const time = hourLabel(at.getHours(), at.getMinutes());
  if (dayKey(at) === dayKey(now)) return `hoy a las ${time}`;
  if (dayKey(at) === dayKey(addDays(now, 1))) return `mañana a las ${time}`;
  return `el ${new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }).format(at)} a las ${time}`;
}

export function LocalReminderPanel() {
  // undefined: revisando.
  const [state, setState] = useState<State | undefined>(undefined);
  const [time, setTime] = useState('19:00');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const chosen = /^\d{2}:\d{2}$/.test(time)
    ? normalizeLocalReminder({ hour: Number(time.slice(0, 2)), minute: Number(time.slice(3)) })
    : undefined;
  const changed = !!chosen && !!state?.reminder &&
    (chosen.hour !== state.reminder.hour || chosen.minute !== state.reminder.minute);

  const refresh = async () => {
    const m = await native();
    const settings = await m.loadLocalReminder();
    const permission = await m.notificationPermission();
    const plan = settings && permission === 'granted' ? await m.syncReminders() : null;
    if (settings) setTime(`${String(settings.hour).padStart(2, '0')}:${String(settings.minute).padStart(2, '0')}`);
    setState({ reminder: settings ?? null, permission, next: plan?.[0]?.at ?? null, exact: await m.exactAlarms() });
  };

  useEffect(() => {
    refresh().catch(() => setState({ reminder: null, permission: 'prompt', next: null, exact: true }));
    // Al volver de los ajustes del celular, revisa otra vez el permiso.
    const onResume = () => void refresh().catch(() => undefined);
    document.addEventListener('resume', onResume);
    return () => document.removeEventListener('resume', onResume);
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage('');
    try {
      await fn();
    } catch {
      setMessage('No se pudo programar el recordatorio. Cierra Danzi, ábrela de nuevo y vuelve a intentarlo.');
    } finally {
      setBusy(false);
    }
  };

  const denied = 'Danzi no tiene permiso para mostrar notificaciones. Actívalo en los ajustes del celular (Apps › Danzi › Notificaciones) y vuelve aquí.';

  const activate = () =>
    run(async () => {
      if (!chosen) return;
      const m = await native();
      if ((await m.enableLocalReminder(chosen.hour, chosen.minute)) === 'denied') {
        setMessage(denied);
        await refresh();
        return;
      }
      await refresh();
      setMessage(`Listo. Te avisamos todos los días a las ${hourLabel(chosen.hour, chosen.minute)}`);
    });

  const saveTime = () => {
    if (!chosen || !changed) return;
    run(async () => {
      await (await native()).changeLocalReminderHour(chosen.hour, chosen.minute);
      await refresh();
      setMessage(`Cambiaste la hora a las ${hourLabel(chosen.hour, chosen.minute)}`);
    });
  };

  const test = () =>
    run(async () => {
      const ok = (await (await native()).testLocalReminder()) === 'ok';
      setMessage(ok ? 'Así se ve el recordatorio.' : denied);
    });

  const turnOff = () =>
    run(async () => {
      await (await native()).disableLocalReminder();
      await refresh();
      setMessage('Recordatorio desactivado.');
    });

  const timeInput = (label: string) => (
    <>
      <label className="field" htmlFor="rem-time">
        <span>{label}</span>
        <input id="rem-time" type="time" step={60} required value={time} disabled={busy}
          aria-describedby="rem-time-help" onChange={(e) => { setTime(e.target.value); setMessage(''); }} />
      </label>
      <p className="note" id="rem-time-help">Elige la hora y los minutos, por ejemplo, 7:43 a. m.</p>
    </>
  );

  let body;
  if (!state) {
    body = <p className="note">Revisando el recordatorio…</p>;
  } else if (state.reminder === null) {
    body = (
      <>
        <p className="note">
          Cada día, a la hora que elijas, te llega un aviso con tu racha y las tarjetas que tienes pendientes. Si ese día ya practicaste, no te
          avisamos. Funciona sin internet.
        </p>
        {timeInput('Hora del aviso')}
        <button type="button" className="btn-primary" disabled={busy || !chosen} onClick={activate}>Activar recordatorio</button>
      </>
    );
  } else if (state.permission !== 'granted') {
    body = (
      <>
        <p className="warn">{denied}</p>
        <button type="button" className="btn-primary" disabled={busy || !chosen} onClick={activate}>Permitir notificaciones</button>
        <button type="button" className="btn-line danger" disabled={busy} onClick={turnOff}>Desactivar recordatorio</button>
      </>
    );
  } else {
    body = (
      <>
        {/* El punto de «p. m.» cierra la oración: no se agrega otro. */}
        <p>Te avisamos todos los días a las <b>{hourLabel(state.reminder.hour, state.reminder.minute)}</b></p>
        {state.next && (
          // Si la hora de hoy no ha pasado y el próximo aviso no es hoy, es porque hoy ya practicaste.
          // Como en el resto de la app, el punto de «p. m.» cierra la oración.
          <p className="note">
            {dayKey(state.next) !== dayKey(new Date()) &&
              new Date().setHours(state.reminder.hour, state.reminder.minute, 0, 0) > Date.now() ? 'Hoy ya practicaste. ' : ''}
            Próximo aviso: {nextLabel(state.next)}
          </p>
        )}
        {!state.exact && <p className="note">Este celular no deja programar alarmas exactas, así que el aviso puede llegar unos minutos tarde.</p>}
        {timeInput('Cambiar la hora')}
        <button type="button" className="btn-primary" disabled={busy || !changed} onClick={saveTime}>Guardar hora</button>
        {changed && <p className="note">Guarda para aplicar el nuevo horario.</p>}
        <button type="button" className="btn-line" disabled={busy} onClick={test}>Probar notificación</button>
        <button type="button" className="btn-line danger" disabled={busy} onClick={turnOff}>Desactivar recordatorio</button>
        <p className="note">Si no abres Danzi en dos semanas, los avisos se detienen hasta que vuelvas.</p>
      </>
    );
  }

  return (
    <section className="panel" aria-labelledby="h-rem">
      <h2 className="label" id="h-rem">Recordatorio diario</h2>
      {body}
      <p className="note" role="status">{message}</p>
    </section>
  );
}
