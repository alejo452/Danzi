import { useEffect, useState } from 'react';
import { versionLabel, type TestRelease } from '../lib/updates';
import type { UpdateStatus } from '../native/updates';

// Ajustes › Actualizaciones, solo en la APK: qué versión tiene y si hay una nueva (src/native/updates.ts).
// En «Danzi Pruebas» se llama «Versiones de prueba» y lista los pull requests abiertos para probar.

const native = () => import('../native/updates');

type Info = { version: number; pr: number; apk: number; pruebas: boolean; builtin: boolean };

function statusText(s: UpdateStatus, pruebas: boolean) {
  const del = (pr?: number) => (pr ? ` del pull request #${pr}` : '');
  switch (s.kind) {
    case 'revisando':
      return <p className="note" role="status">Buscando la versión nueva…</p>;
    case 'al-dia':
      return <p className="note" role="status">{pruebas ? 'Tienes la versión más reciente de este pull request.' : 'Tienes la versión más reciente.'}</p>;
    case 'descargando':
      return <p className="note" role="status">Descargando la versión {versionLabel(s.version)}{del(s.pr)}…</p>;
    case 'lista':
      return (
        <p className="note" role="status">
          La versión {versionLabel(s.version)}{del(s.pr)} ya está descargada. {pruebas ? 'Danzi Pruebas' : 'Danzi'} la usa la próxima vez que vuelvas a la
          app.
        </p>
      );
    case 'aplicando':
      return <p className="note" role="status">Cambiando a la versión {versionLabel(s.version)}{del(s.pr)}…</p>;
    case 'necesita-apk':
      return s.pr ? (
        <>
          <p className="warn" role="status">
            La versión {versionLabel(s.version)} del pull request #{s.pr} trae cambios en la parte de Android, así que hay que instalar su APK de
            prueba. Se instala encima de esta, sin desinstalar.
          </p>
          <a className="btn-primary" href={s.apkUrl}>Descargar la APK de prueba</a>
        </>
      ) : (
        <>
          <p className="warn" role="status">
            La versión {versionLabel(s.version)} trae cambios en la parte de Android, así que esta vez hay que instalar la APK. Se instala encima de la
            que tienes, sin perder el progreso.
          </p>
          <a className="btn-primary" href={s.apkUrl}>Descargar la APK nueva</a>
        </>
      );
    case 'fallo':
      return (
        <p className="note" role="status">
          La versión {versionLabel(s.version)} no arrancó bien en este celular, así que sigues con la anterior. Cuando salga una versión nueva,{' '}
          {pruebas ? 'Danzi Pruebas' : 'Danzi'} la descarga sola.
        </p>
      );
    case 'sin-conexion':
      return <p className="note" role="status">No se pudo buscar la versión nueva. Revisa la conexión a internet y vuelve a intentarlo.</p>;
    case 'error':
      return <p className="note" role="status">No se pudo revisar si hay una versión nueva. Cierra Danzi, ábrela de nuevo y vuelve a intentarlo.</p>;
    case 'desarrollo':
      return <p className="note" role="status">Esta APK se compiló sin número de versión, así que no busca actualizaciones.</p>;
    case 'sin-version-prueba':
      return (
        <p className="note" role="status">
          No encontramos la versión de prueba del pull request #{s.pr}: puede que ya se haya cerrado o que GitHub todavía la esté compilando. Elige otro
          pull request de la lista.
        </p>
      );
    case 'sin-pr':
      return <p className="note" role="status">Elige un pull request de la lista para probar su versión.</p>;
  }
}

export function UpdatePanel() {
  const [status, setStatus] = useState<UpdateStatus>({ kind: 'revisando' });
  const [info, setInfo] = useState<Info>({ version: 0, pr: 0, apk: 0, pruebas: false, builtin: true });
  const [busy, setBusy] = useState(false);
  // undefined: cargando; null: no se pudo cargar.
  const [tests, setTests] = useState<TestRelease[] | null | undefined>(undefined);

  const loadTests = async () => {
    setTests(undefined);
    setTests(await (await native()).listTestReleases());
  };

  useEffect(() => {
    let off = () => {};
    let alive = true;
    native()
      .then((m) => {
        if (!alive) return;
        const read = () => ({ version: m.WEB_VERSION, pr: m.WEB_PR, apk: m.apkVersion(), pruebas: m.isPruebas(), builtin: m.runningBuiltin() });
        setInfo(read());
        setStatus(m.getStatus());
        off = m.onStatus((s) => {
          if (!alive) return;
          setStatus(s);
          setInfo(read());
        });
        // Normalmente ya empezó al abrir la app (App.tsx); si no, empieza aquí.
        void m.startUpdates().then(() => {
          if (!alive) return;
          setInfo(read());
          if (m.isPruebas()) void loadTests();
        });
      })
      .catch(() => alive && setStatus({ kind: 'error' }));
    return () => {
      alive = false;
      off();
    };
  }, []);

  const run = async (fn: (m: Awaited<ReturnType<typeof native>>) => Promise<void>) => {
    setBusy(true);
    try {
      await fn(await native());
    } finally {
      setBusy(false);
    }
  };

  const { pruebas } = info;
  const canCheck = status.kind !== 'desarrollo' && status.kind !== 'error';
  const working = busy || status.kind === 'revisando' || status.kind === 'descargando' || status.kind === 'aplicando';

  return (
    <section className="panel" aria-labelledby="h-upd">
      <h2 className="label" id="h-upd">{pruebas ? 'Versiones de prueba' : 'Actualizaciones'}</h2>
      {info.version > 0 && (
        <p>
          Versión <b>{versionLabel(info.version)}</b>
          {info.pr > 0 && <> del pull request <b>#{info.pr}</b></>}
          {info.apk > 0 && info.apk !== info.version && <small className="note"> · APK {versionLabel(info.apk)}</small>}
        </p>
      )}
      {canCheck && (
        <p className="note">
          {pruebas
            ? 'Danzi Pruebas recibe la versión de prueba de cada pull request: al abrirla, descarga la versión nueva del que estás probando.'
            : 'Danzi se actualiza sola: al abrirla, busca la versión nueva y la descarga. Tu progreso no cambia.'}
        </p>
      )}
      {statusText(status, pruebas)}
      {canCheck && status.kind !== 'necesita-apk' && status.kind !== 'sin-pr' && (
        <button type="button" className="btn-line" disabled={working} onClick={() => run((m) => m.checkForUpdate(true))}>
          Buscar actualización
        </button>
      )}

      {pruebas && (
        <>
          <h3 className="label" id="h-prs">Pull requests para probar</h3>
          {tests === undefined ? (
            <p className="note" role="status">Cargando la lista…</p>
          ) : tests === null ? (
            <p className="note" role="status">No se pudo cargar la lista de GitHub. Revisa la conexión y vuelve a intentarlo en un rato.</p>
          ) : tests.length === 0 ? (
            <p className="note" role="status">No hay pull requests abiertos con versión de prueba.</p>
          ) : (
            <ul className="test-list" aria-labelledby="h-prs">
              {tests.map((t) => (
                <li key={t.pr} className="row">
                  <span>
                    {t.title}
                    <small>Pull request #{t.pr}</small>
                  </span>
                  {t.pr === info.pr ? (
                    <small>La tienes</small>
                  ) : (
                    <button type="button" className="btn-line btn-small" disabled={working} onClick={() => run((m) => m.chooseTestPr(t.pr))}>
                      Probar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {tests !== undefined && (
            <button type="button" className="btn-line" disabled={working} onClick={loadTests}>Actualizar la lista</button>
          )}
          {!info.builtin && (
            <button type="button" className="btn-line" disabled={working} onClick={() => run((m) => m.resetToApk())}>
              Volver a la versión de la APK
            </button>
          )}
        </>
      )}
    </section>
  );
}
