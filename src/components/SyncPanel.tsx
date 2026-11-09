import { useEffect, useState, type FormEvent } from 'react';
import { cleanEmail, getCloudState, MAX_PASSWORD, MIN_PASSWORD, newPasswordProblem, syncedAgo, useCloudState } from '../lib/cloudConfig';

// Ajustes › Tu cuenta: entrar o crear la cuenta con correo y contraseña, y sincronizar el progreso entre dispositivos.
// Supabase (src/lib/cloud.ts) se carga solo cuando hace falta: al entrar o crear la cuenta, o con la sesión iniciada.

const cloud = () => import('../lib/cloud');

export function SyncPanel() {
  const s = useCloudState();
  const [mode, setMode] = useState<'entrar' | 'crear'>('entrar');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [now, setNow] = useState(() => Date.now());

  // El «hace 5 min» de la última sincronización.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

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

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const clean = cleanEmail(email);
    if (!clean) return setMessage('Escribe tu correo completo, por ejemplo tu.nombre@gmail.com.');
    if (!password) return setMessage('Escribe tu contraseña.');
    const problem = mode === 'crear' ? newPasswordProblem(password) : '';
    if (problem) return setMessage(problem);
    void run(async () => {
      const m = await cloud();
      await (mode === 'crear' ? m.signUp(clean, password) : m.signIn(clean, password));
      setPassword('');
    });
  };

  const switchMode = () => {
    setMode(mode === 'entrar' ? 'crear' : 'entrar');
    setMessage('');
  };

  const syncNow = () =>
    run(async () => {
      await (await cloud()).syncNow();
      if (!getCloudState().error) setMessage('Listo: tu progreso está al día.');
    });

  const signOut = () =>
    run(async () => {
      await (await cloud()).signOut();
      setMode('entrar');
      setMessage('Cerraste la sesión. Tu progreso sigue en este dispositivo.');
    });

  let body;
  if (s.phase === 'fuera') {
    const creating = mode === 'crear';
    body = (
      <form onSubmit={submit} noValidate>
        <p className="note">
          {creating
            ? `Escribe tu correo y crea una contraseña de al menos ${MIN_PASSWORD} caracteres. Guárdala bien: la necesitas para entrar en tus otros dispositivos.`
            : 'Con una cuenta, tu progreso queda igual en todos tus dispositivos: tarjetas, escritura, racha, monedas, sellos, temas y ajustes.'}
        </p>
        <label className="field" htmlFor="sync-email">
          <span>Correo</span>
          <input
            id="sync-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            disabled={busy}
            onChange={(e) => {
              setEmail(e.target.value);
              setMessage('');
            }}
          />
        </label>
        <label className="field" htmlFor="sync-password">
          <span>{creating ? 'Contraseña nueva' : 'Contraseña'}</span>
          <input
            id="sync-password"
            type={show ? 'text' : 'password'}
            autoComplete={creating ? 'new-password' : 'current-password'}
            autoCapitalize="none"
            spellCheck={false}
            maxLength={MAX_PASSWORD}
            value={password}
            disabled={busy}
            onChange={(e) => {
              setPassword(e.target.value);
              setMessage('');
            }}
          />
        </label>
        <label className="row" htmlFor="sync-show">
          <span>Mostrar la contraseña</span>
          <input id="sync-show" type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
        </label>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? (creating ? 'Creando la cuenta…' : 'Entrando…') : creating ? 'Crear cuenta' : 'Entrar'}
        </button>
        <button type="button" className="btn-line" disabled={busy} onClick={switchMode}>
          {creating ? 'Ya tengo cuenta' : 'Crear una cuenta nueva'}
        </button>
        {!creating && <p className="note">¿Olvidaste la contraseña? Pídele a quien administra Danzi que te ponga una nueva.</p>}
        {s.error && <p className="warn">{s.error}</p>}
      </form>
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
