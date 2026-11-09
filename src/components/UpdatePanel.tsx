import { useEffect, useState } from 'react';
import { APK_URL, versionLabel } from '../lib/updates';
import type { UpdateStatus } from '../native/updates';

// Ajustes › Actualizaciones, solo en la APK: qué versión tiene y si hay una nueva (src/native/updates.ts).

const native = () => import('../native/updates');

export function UpdatePanel() {
  const [status, setStatus] = useState<UpdateStatus>({ kind: 'revisando' });
  const [version, setVersion] = useState(0);
  const [apk, setApk] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let off = () => {};
    let alive = true;
    native()
      .then((m) => {
        if (!alive) return;
        setVersion(m.WEB_VERSION);
        setStatus(m.getStatus());
        off = m.onStatus((s) => {
          if (!alive) return;
          setStatus(s);
          setApk(m.apkVersion());
        });
        // Normalmente ya empezó al abrir la app (App.tsx); si no, empieza aquí.
        void m.startUpdates().then(() => alive && setApk(m.apkVersion()));
      })
      .catch(() => alive && setStatus({ kind: 'error' }));
    return () => {
      alive = false;
      off();
    };
  }, []);

  const check = async () => {
    setBusy(true);
    try {
      await (await native()).checkForUpdate(true);
    } finally {
      setBusy(false);
    }
  };

  let body;
  switch (status.kind) {
    case 'revisando':
      body = <p className="note" role="status">Buscando la versión nueva…</p>;
      break;
    case 'al-dia':
      body = <p className="note" role="status">Tienes la versión más reciente.</p>;
      break;
    case 'descargando':
      body = <p className="note" role="status">Descargando la versión {versionLabel(status.version)}…</p>;
      break;
    case 'lista':
      body = (
        <p className="note" role="status">
          La versión {versionLabel(status.version)} ya está descargada. Danzi la usa la próxima vez que vuelvas a la app.
        </p>
      );
      break;
    case 'necesita-apk':
      body = (
        <>
          <p className="warn" role="status">
            La versión {versionLabel(status.version)} trae cambios en la parte de Android, así que esta vez hay que instalar la APK. Se instala
            encima de la que tienes, sin perder el progreso.
          </p>
          <a className="btn-primary" href={APK_URL}>Descargar la APK nueva</a>
        </>
      );
      break;
    case 'fallo':
      body = (
        <p className="note" role="status">
          La versión {versionLabel(status.version)} no arrancó bien en este celular, así que sigues con la anterior. Cuando salga una versión
          nueva, Danzi la descarga sola.
        </p>
      );
      break;
    case 'sin-conexion':
      body = <p className="note" role="status">No se pudo buscar la versión nueva. Revisa la conexión a internet y vuelve a intentarlo.</p>;
      break;
    case 'error':
      body = <p className="note" role="status">No se pudo revisar si hay una versión nueva. Cierra Danzi, ábrela de nuevo y vuelve a intentarlo.</p>;
      break;
    case 'pruebas':
      body = <p className="note" role="status">Danzi Pruebas no se actualiza sola: para probar otra versión, instala la de ese pull request.</p>;
      break;
    case 'desarrollo':
      body = <p className="note" role="status">Esta APK se compiló sin número de versión, así que no busca actualizaciones.</p>;
      break;
  }

  const canCheck = status.kind !== 'pruebas' && status.kind !== 'desarrollo' && status.kind !== 'error';
  const working = busy || status.kind === 'revisando' || status.kind === 'descargando';

  return (
    <section className="panel" aria-labelledby="h-upd">
      <h2 className="label" id="h-upd">Actualizaciones</h2>
      {version > 0 && (
        <p>
          Versión <b>{versionLabel(version)}</b>
          {apk > 0 && apk !== version && <small className="note"> · APK {versionLabel(apk)}</small>}
        </p>
      )}
      {canCheck && (
        <p className="note">Danzi se actualiza sola: al abrirla, busca la versión nueva y la descarga. Tu progreso no cambia.</p>
      )}
      {body}
      {canCheck && status.kind !== 'necesita-apk' && (
        <button type="button" className="btn-line" disabled={working} onClick={check}>Buscar actualización</button>
      )}
    </section>
  );
}
