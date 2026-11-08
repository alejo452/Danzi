import { useEffect, useState } from 'react';
import { addDays, dayKey } from '../lib/dates';
import { hourLabel } from '../lib/reminderCode';
import type { NotificationPermission } from '../native/reminders';

// Recordatorio diario en la APK de Android: lo programa el propio celular, sin GitHub ni internet.
// La versión web usa ReminderPanel (avisos que manda GitHub).

const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 6:00 a. m. a 10:00 p. m.

const native = () => import('../native/reminders');

type State = {
  /** null: el recordatorio está apagado. */
  hour: number | null;
  permission: NotificationPermission;
  next: Date | null;
  exact: boolean;
};

/** "hoy a las 7:00 p. m.", "mañana a las…", "el lunes 10 de noviembre a las…". */
function nextLabel(at: Date, now = new Date()): string {
  const time = hourLabel(at.getHours());
  if (dayKey(at) === dayKey(now)) return `hoy a las ${time}`;
  if (dayKey(at) === dayKey(addDays(now, 1))) return `mañana a las ${time}`;
  return `el ${new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }).format(at)} a las ${time}`;
}

export function LocalReminderPanel() {
  // undefined: revisando.
  const [state, setState] = useState<State | undefined>(undefined);
  const [hour, setHour] = useState(19);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = async () => {
    const m = await native();
    const settings = await m.loadLocalReminder();
    const permission = await m.notificationPermission();
    const plan = settings && permission === 'granted' ? await m.syncReminders() : null;
    if (settings) setHour(settings.hour);
    setState({ hour: settings?.hour ?? null, permission, next: plan?.[0]?.at ?? null, exact: await m.exactAlarms() });
  };

  useEffect(() => {
    refresh().catch(() => setState({ hour: null, permission: 'prompt', next: null, exact: true }));
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
      const m = await native();
      if ((await m.enableLocalReminder(hour)) === 'denied') {
        setMessage(denied);
        await refresh();
        return;
      }
      await refresh();
      setMessage(`Listo. Te avisamos todos los días a las ${hourLabel(hour)}`);
    });

  const changeHour = (h: number) => {
    setHour(h);
    if (state?.hour == null) return;
    run(async () => {
      await (await native()).changeLocalReminderHour(h);
      await refresh();
      setMessage(`Cambiaste la hora a las ${hourLabel(h)}`);
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

  const hourSelect = (label: string) => (
    <label className="field" htmlFor="rem-hour">
      <span>{label}</span>
      <select id="rem-hour" value={hour} disabled={busy} onChange={(e) => changeHour(Number(e.target.value))}>
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {hourLabel(h)}
          </option>
        ))}
      </select>
    </label>
  );

  let body;
  if (!state) {
    body = <p className="note">Revisando el recordatorio…</p>;
  } else if (state.hour === null) {
    body = (
      <>
        <p className="note">
          Cada día, a la hora que elijas, te llega un aviso con tu racha y las tarjetas que tienes pendientes. Si ese día ya practicaste, no te
          avisamos. Funciona sin internet.
        </p>
        {hourSelect('Hora del aviso')}
        <button type="button" className="btn-primary" disabled={busy} onClick={activate}>Activar recordatorio</button>
      </>
    );
  } else if (state.permission !== 'granted') {
    body = (
      <>
        <p className="warn">{denied}</p>
        <button type="button" className="btn-primary" disabled={busy} onClick={activate}>Permitir notificaciones</button>
        <button type="button" className="btn-line danger" disabled={busy} onClick={turnOff}>Desactivar recordatorio</button>
      </>
    );
  } else {
    body = (
      <>
        {/* El punto de «p. m.» cierra la oración: no se agrega otro. */}
        <p>Te avisamos todos los días a las <b>{hourLabel(state.hour)}</b></p>
        {state.next && (
          // Si la hora de hoy no ha pasado y el próximo aviso no es hoy, es porque hoy ya practicaste.
          // Como en el resto de la app, el punto de «p. m.» cierra la oración.
          <p className="note">
            {dayKey(state.next) !== dayKey(new Date()) && state.hour > new Date().getHours() ? 'Hoy ya practicaste. ' : ''}
            Próximo aviso: {nextLabel(state.next)}
          </p>
        )}
        {!state.exact && <p className="note">Este celular no deja programar alarmas exactas, así que el aviso puede llegar unos minutos tarde.</p>}
        {hourSelect('Cambiar la hora')}
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
      {message && <p className="note" role="status">{message}</p>}
    </section>
  );
}
