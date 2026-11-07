import { useEffect, useRef, useState } from 'react';
import { addDays, dayKey } from '../lib/dates';
import { hourLabel } from '../lib/reminderCode';
import { reminderMessage, reminderNotification } from '../lib/reminderMessage';
import {
  changeReminderHour,
  checkReminder,
  disableReminder,
  enableReminder,
  isInstalledApp,
  isIos,
  loadPushLog,
  loadReminder,
  markReminderCopied,
  reminderSupport,
  swReady,
  type PushLog,
  type ReminderState,
} from '../lib/reminders';
import { getProgress } from '../lib/useProgress';

const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 6:00 a. m. a 10:00 p. m.

/** Página de GitHub para crear el secreto, si la app está publicada en GitHub Pages. */
function secretsPage(): string | null {
  if (!location.hostname.endsWith('.github.io')) return null;
  const owner = location.hostname.split('.')[0];
  const repo = location.pathname.split('/').filter(Boolean)[0];
  return repo ? `https://github.com/${owner}/${repo}/settings/secrets/actions/new` : null;
}

/** "hoy a las 4:31 p. m.", "ayer a las…", "el 3 de noviembre a las…". */
function whenLabel(at: number, now = new Date()): string {
  const d = new Date(at);
  const time = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' }).format(d);
  if (dayKey(d) === dayKey(now)) return `hoy a las ${time}`;
  if (dayKey(d) === dayKey(addDays(now, -1))) return `ayer a las ${time}`;
  return `el ${new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long' }).format(d)} a las ${time}`;
}

function errorText(e: unknown): string {
  const m = e instanceof Error ? e.message : '';
  if (m === 'denied') return 'Bloqueaste las notificaciones de Danzi. Permítelas en los ajustes del navegador y vuelve a intentarlo.';
  if (m === 'dismissed') return 'No diste permiso para las notificaciones. Toca «Activar recordatorio» otra vez y elige «Permitir».';
  if (m === 'sw') return 'Danzi todavía se está instalando en este dispositivo. Espera un momento con internet y vuelve a intentarlo.';
  return 'No se pudo activar el recordatorio. Revisa tu conexión a internet y vuelve a intentarlo.';
}

export function ReminderPanel() {
  const [support, setSupport] = useState(reminderSupport);
  // undefined: revisando; null: sin recordatorio en este dispositivo.
  const [state, setState] = useState<ReminderState | null | undefined>(undefined);
  const [hour, setHour] = useState(19);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [log, setLog] = useState<PushLog | undefined>(undefined);
  const codeRef = useRef<HTMLTextAreaElement>(null);
  const githubPage = secretsPage();
  // En Android, si Danzi está instalada, el permiso de notificaciones es de la app instalada:
  // activar el recordatorio desde una pestaña del navegador puede no servir.
  const inBrowserTab = !isInstalledApp() && !isIos();

  // El service worker anota cada aviso que llega. Se vuelve a leer al regresar a la app.
  useEffect(() => {
    const refresh = () => loadPushLog().then(setLog);
    refresh();
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(refresh, 15_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    loadReminder().then(async (s) => {
      if (!alive) return;
      setState(s ?? null);
      if (!s) return;
      setHour(s.code.hour);
      const check = reminderSupport() === 'ok' ? await checkReminder(s).catch(() => 'ok' as const) : 'ok';
      if (check === 'missing' && alive) setMissing(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage('');
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const activate = () =>
    run(async () => {
      try {
        setState(await enableReminder(hour));
        setMissing(false);
        setLog(undefined);
        setMessage('Recordatorio activado. Copia el código y pégalo en GitHub para que te lleguen los avisos.');
      } catch (e) {
        setSupport(reminderSupport());
        setMessage(errorText(e));
      }
    });

  const changeHour = (h: number) => {
    setHour(h);
    if (!state) return;
    run(async () => {
      setState(await changeReminderHour(state, h));
      setMessage(`Cambiaste la hora a las ${hourLabel(h)} Copia el código nuevo y reemplázalo en GitHub.`);
    });
  };

  const copy = () =>
    run(async () => {
      if (!state) return;
      try {
        await navigator.clipboard.writeText(state.text);
        setState(await markReminderCopied(state));
        setMessage('Código copiado. Ahora pégalo en GitHub.');
      } catch {
        codeRef.current?.select();
        setMessage('No se pudo copiar solo. Selecciona el código y cópialo.');
      }
    });

  const test = () =>
    run(async () => {
      try {
        const reg = await swReady();
        const { title, options } = reminderNotification(reminderMessage(getProgress(), new Date()), reg.scope);
        await reg.showNotification(title, options);
        setMessage('Así se ve el recordatorio. El aviso diario te lo manda GitHub a la hora que elegiste.');
      } catch {
        setSupport(reminderSupport());
        setMessage('No se pudo mostrar la notificación. Revisa que las notificaciones de Danzi estén permitidas en el navegador.');
      }
    });

  const turnOff = () =>
    run(async () => {
      await disableReminder().catch(() => undefined);
      setState(null);
      setMissing(false);
      setLog(undefined);
      setMessage('Recordatorio desactivado. Si pegaste el código en GitHub, borra también ese secreto.');
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
  if (support === 'ios-install') {
    body = <p className="note">En iPhone, primero agrega Danzi a la pantalla de inicio (Compartir › Agregar a inicio) y ábrela desde ese ícono. Ahí vas a poder activar el recordatorio.</p>;
  } else if (support === 'unsupported') {
    body = <p className="note">Este navegador no permite notificaciones. Abre Danzi en Chrome (Android) o instalada en la pantalla de inicio (iPhone).</p>;
  } else if (support === 'denied') {
    body = (
      <>
        <p className="warn">Las notificaciones de Danzi están bloqueadas. Permítelas en los ajustes del navegador y toca «Revisar otra vez».</p>
        <button type="button" className="btn-line" onClick={() => setSupport(reminderSupport())}>Revisar otra vez</button>
      </>
    );
  } else if (state === undefined) {
    body = <p className="note">Revisando el recordatorio…</p>;
  } else if (!state) {
    body = (
      <>
        <p className="note">Cada día, a la hora que elijas, te llega un aviso con tu racha y las tarjetas que tienes pendientes.</p>
        {inBrowserTab && <p className="note">Si instalaste Danzi en la pantalla de inicio, activa el recordatorio desde ese ícono y no desde el navegador.</p>}
        {hourSelect('Hora del aviso')}
        <button type="button" className="btn-primary" disabled={busy} onClick={activate}>Activar recordatorio</button>
      </>
    );
  } else {
    body = (
      <>
        {missing ? (
          <>
            <p className="warn">
              El celular canceló los avisos de Danzi. Suele pasar si sus notificaciones están bloqueadas en los ajustes del celular, o si el recordatorio se activó desde el navegador
              teniendo la app instalada. Revisa los permisos, toca «Activar de nuevo» y reemplaza el secreto en GitHub con el código nuevo.
            </p>
            {inBrowserTab && <p className="note">Si instalaste Danzi en la pantalla de inicio, haz esto desde ese ícono.</p>}
            <button type="button" className="btn-primary" disabled={busy} onClick={activate}>Activar de nuevo</button>
          </>
        ) : (
          // El punto de «p. m.» cierra la oración: no se agrega otro.
          <p>Te avisamos todos los días a las <b>{hourLabel(state.code.hour)}</b></p>
        )}
        {state.changed && !missing && <p className="warn">El código cambió. Cópialo otra vez y reemplaza el secreto en GitHub.</p>}
        {!missing &&
          (!log ? (
            <p className="note">Este dispositivo todavía no ha recibido avisos de GitHub.</p>
          ) : log.shown ? (
            <p className="note">
              Último aviso recibido: {whenLabel(log.at)}
              {log.kind === 'prueba' ? ' (prueba)' : ''}
            </p>
          ) : (
            <p className="warn">
              El último aviso llegó {whenLabel(log.at)}, pero el celular no dejó mostrarlo. Revisa en los ajustes del celular que las notificaciones de Danzi y de Chrome estén permitidas.
            </p>
          ))}
        <label className="field" htmlFor="rem-code">
          <span>Código para GitHub</span>
          <textarea id="rem-code" ref={codeRef} className="code" readOnly rows={4} value={state.text} onFocus={(e) => e.target.select()} />
        </label>
        <button type="button" className="btn-primary" disabled={busy} onClick={copy}>Copiar código</button>
        <details className="help">
          <summary>Cómo pegar el código en GitHub</summary>
          <ol className="steps">
            <li>
              En el repositorio de Danzi en GitHub, entra a Settings › Secrets and variables › Actions y toca «New repository secret».
              {githubPage && (
                <>
                  {' '}
                  <a href={githubPage} target="_blank" rel="noreferrer">Abrir esa página</a>
                </>
              )}
            </li>
            <li>En «Name» escribe DANZI_RECORDATORIO. Si ya existe uno de otro dispositivo, usa DANZI_RECORDATORIO_2.</li>
            <li>En «Secret» pega el código y toca «Add secret».</li>
            <li>Para probar, entra a Actions › Recordatorios diarios › Run workflow. En un par de minutos te llega un aviso de prueba.</li>
          </ol>
          <p className="note">Si no manejas el repositorio, mándale el código a quien lo maneja. Cada vez que cambies la hora, reemplaza el secreto con el código nuevo.</p>
        </details>
        {hourSelect('Cambiar la hora')}
        <button type="button" className="btn-line" disabled={busy} onClick={test}>Probar notificación</button>
        <button type="button" className="btn-line danger" disabled={busy} onClick={turnOff}>Desactivar recordatorio</button>
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
