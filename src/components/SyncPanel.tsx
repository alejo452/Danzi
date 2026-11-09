import { useEffect, useState, type FormEvent } from 'react';
import { cancelCode, cleanCode, cleanEmail, CODE_RESEND_MS, getCloudState, syncedAgo, useCloudState } from '../lib/cloudConfig';

// Ajustes › Tu cuenta: entrar con un código por correo y sincronizar el progreso entre dispositivos.
// Supabase (src/lib/cloud.ts) se carga solo cuando hace falta: al pedir el código o con la sesión iniciada.

const cloud = () => import('../lib/cloud');

export function SyncPanel() {
  const s = useCloudState();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [now, setNow] = useState(() => Date.now());

  // La cuenta regresiva para pedir otro código y el «hace 5 min» de la última sincronización.
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), s.phase === 'codigo' ? 1000 : 30_000);
    return () => clearInterval(t);
  }, [s.phase]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage('');
    try {
      await fn();
    } catch (e) {
      setMessage(e instanceof Error && e.message ? e.message : 'Algo falló. Vuelve a intentarlo.');
    } finally {
      setBusy(false);
    }
  };

  const send = (to: string) =>
    run(async () => {
      await (await cloud()).sendCode(to);
      setCode('');
    });

  const onEmail = (e: FormEvent) => {
    e.preventDefault();
    const clean = cleanEmail(email);
    if (!clean) setMessage('Escribe tu correo completo, por ejemplo tu.nombre@gmail.com.');
    else void send(clean);
  };

  const onCode = (e: FormEvent) => {
    e.preventDefault();
    const clean = cleanCode(code);
    if (!clean) setMessage('Escribe el código completo que te llegó al correo (solo números).');
    else void run(async () => (await cloud()).verifyCode(clean));
  };

  const syncNow = () =>
    run(async () => {
      await (await cloud()).syncNow();
      if (!getCloudState().error) setMessage('Listo: tu progreso está al día.');
    });

  const signOut = () =>
    run(async () => {
      await (await cloud()).signOut();
      setMessage('Cerraste la sesión. Tu progreso sigue en este dispositivo.');
    });

  let body;
  if (s.phase === 'fuera') {
    body = (
      <form onSubmit={onEmail}>
        <p className="note">
          Inicia sesión para tener el mismo progreso en todos tus dispositivos: tarjetas, escritura, racha, monedas, sellos, temas y ajustes. Te
          mandamos un código al correo; no necesitas contraseña.
        </p>
        <label className="field" htmlFor="sync-email">
          <span>Tu correo</span>
          <input
            id="sync-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            disabled={busy}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Enviando el código…' : 'Enviarme el código'}</button>
        {s.error && <p className="warn">{s.error}</p>}
      </form>
    );
  } else if (s.phase === 'codigo') {
    const wait = Math.min(CODE_RESEND_MS / 1000, Math.ceil((s.codeAt + CODE_RESEND_MS - now) / 1000));
    body = (
      <>
        <form onSubmit={onCode}>
          <p>
            Te mandamos un código a <b>{s.email}</b>. Escríbelo aquí.
          </p>
          <label className="field" htmlFor="sync-code">
            <span>Código</span>
            <input
              id="sync-code"
              className="code-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={12}
              value={code}
              disabled={busy}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
        </form>
        <p className="note">Si no te llega en unos minutos, revisa la carpeta de spam o pide otro código.</p>
        <button type="button" className="btn-line" disabled={busy || wait > 0} onClick={() => send(s.email)}>
          {wait > 0 ? `Enviar otro código (en ${wait} s)` : 'Enviar otro código'}
        </button>
        <button type="button" className="btn-line" disabled={busy} onClick={() => (cancelCode(), setMessage(''))}>Cambiar el correo</button>
      </>
    );
  } else {
    body = (
      <>
        <p>{s.email ? <>Sesión iniciada con <b>{s.email}</b>.</> : 'Sesión iniciada.'}</p>
        <p className="note">
          {s.syncing ? 'Sincronizando…' : s.lastSync ? `Última sincronización: ${syncedAgo(s.lastSync, now)}.` : 'Todavía no se ha sincronizado.'}
        </p>
        {s.error && !s.syncing && <p className="warn" role="status">{s.error}</p>}
        <button type="button" className="btn-line" disabled={busy || s.syncing} onClick={syncNow}>Sincronizar ahora</button>
        <button type="button" className="btn-line" disabled={busy} onClick={signOut}>Cerrar sesión</button>
        <p className="note">Se sincroniza solo al abrir y al cerrar Danzi, y mientras practicas. El recordatorio diario es de cada dispositivo.</p>
      </>
    );
  }

  return (
    <section className="panel" aria-labelledby="h-sync">
      <h2 className="label" id="h-sync">Tu cuenta</h2>
      {body}
      {message && <p className="note" role="status">{message}</p>}
    </section>
  );
}
