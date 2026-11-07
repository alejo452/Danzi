# Danzi — guía para Claude

App web instalable (PWA) para aprender chino mandarín desde el español, siguiendo el **HSK 3.0** (《HSK考试大纲》, noviembre de 2025). La usa Diego, estudiante colombiano, sobre todo desde el celular. Toda la interfaz está en **español de Colombia, tuteando**.

## Comandos

- `npm run dev`: servidor local.
- `npm test`: pruebas (datos, repaso espaciado, voz, recordatorios). **Deben pasar antes de cada commit.**
- `npm run check`: revisión de tipos.
- `npm run build`: build de producción (copia antes los datos de trazos a `public/strokes/`).
- `npm run data:skeleton -- <nivel>`: crea el borrador de un nivel desde el temario oficial.

## Estructura

- `src/App.tsx`: navegación por pestañas (`#inicio`, `#repasar`, `#escribir`, `#hablar`, `#palabras`) y dos vistas sin pestaña (`#ajustes` y `#premios`, a las que se llega desde Inicio). También aplica el tema de color, usa los protectores de racha al abrir la app y muestra las celebraciones y los avisos.
- `src/views/`: una vista por pestaña.
- `src/lib/srs.ts`: repaso espaciado con FSRS (`ts-fsrs`). Pasos de aprendizaje: 1 min y 10 min.
- `src/lib/queue.ts`: qué tarjeta toca y cuántas quedan hoy. Sirve para los dos mazos: lectura (`read`) y escritura (`write`).
- `src/lib/progress.ts`: modelo del progreso, con funciones puras. `src/lib/useProgress.ts` lo guarda en IndexedDB. Va en la versión 2: además de mazos y actividad, guarda las recompensas y la meta diaria, y `recordAnswer` y `recordSpeaking` suman monedas con tope diario.
- Recompensas:
  - `src/lib/rewards.ts`: funciones puras de la meta diaria y el sobre rojo (红包), los protectores de racha, la mejor racha, los sellos (印章), la tienda y el calendario.
  - `src/views/Rewards.tsx`: la vista Premios (`#premios`), con el saldo, la tienda (protectores y temas) y los sellos.
  - Componentes: `StreakCalendar` (calendario de racha, se abre al tocar la racha en Inicio), `Envelope` (sobre rojo), `Celebrations` (sellos nuevos y protector usado), `CoinCount`, `GoalRing`, `SealMark`, `Sheet` (hoja modal), `Confetti` y `Toasts`.
- `src/lib/speech.ts`: lectura en voz alta y reconocimiento de voz en chino.
- `src/lib/compare.ts`: compara lo que entendió el reconocimiento con la frase objetivo, por sílabas de pinyin.
- `src/lib/tones.ts`: ejercicio de tonos.
- `src/lib/strokes.ts`: carga los trazos para la escritura y revisa cuáles están guardados en el dispositivo (Ajustes › Escritura sin internet).
- `src/sw.ts`: service worker propio (`injectManifest` en `vite.config.ts`). Guarda la app y los trazos para usarla sin internet y muestra el recordatorio diario cuando llega el push.
- Recordatorio diario:
  - `src/lib/reminderMessage.ts`: texto del aviso, según la racha y las tarjetas pendientes.
  - `src/lib/reminderCode.ts`: el código que se pega como secreto en GitHub.
  - `src/lib/reminders.ts`: permiso y suscripción push en el dispositivo.
  - `src/components/ReminderPanel.tsx`: la sección de Ajustes.
  - `scripts/send-reminders.mjs` y `.github/workflows/recordatorios.yml`: el envío, cada hora, a los dispositivos registrados en los secretos `DANZI_RECORDATORIO`, `DANZI_RECORDATORIO_2` y `DANZI_RECORDATORIO_3`.
- `src/data/levels.ts`: carga de los niveles. Un nivel está disponible si existe `src/data/hsk/level-<id>.json`. La lista de niveles está en `src/data/levelList.ts`, que no carga datos para que también la pueda usar el service worker.
- `data-source/hsk-2025-syllabus.json`: temario oficial completo, con 11 000 palabras en filas `[id, nivel, hanzi, pinyin, categoría]`. No editarlo.
- `scripts/build-strokes.mjs`: copia los trazos de `hanzi-writer-data` solo para los caracteres del vocabulario. El service worker los descarga todos al instalar la app (`globPatterns` en `vite.config.ts`), así que la escritura funciona sin internet.

## Reglas que no se rompen

1. **El progreso es del usuario.** Vive en IndexedDB y no se puede recuperar si se pierde.
   - Las tarjetas se identifican por el `id` del temario. Nunca cambies ni reutilices un `id`.
   - Si cambias el formato de `Progress`, sube `PROGRESS_VERSION` y agrega la migración en `normalizeProgress`. Agrega también una prueba que convierta datos del formato anterior.
2. **Los datos de un nivel solo entran a `src/data/hsk/` completos.** Las pruebas de `tests/data.test.ts` exigen cuatro cosas:
   - Que estén exactamente las palabras del temario para ese nivel, con su hanzi, pinyin y categoría sin cambios.
   - Que cada palabra tenga significado en español y un ejemplo completo (`zh`, `py`, `es`) que la use.
   - Que el pinyin del ejemplo tenga las mismas sílabas que el texto chino.
   - Que cada carácter tenga datos de trazos en `hanzi-writer-data`, para poder escribirlo.
3. **No inventes datos del temario.** Si algo no cuadra con el temario, dilo en lugar de corregirlo a mano.
4. **Los ids de los sellos y de los temas no cambian.** Son las claves en `progress.rewards` (`SEALS` y `THEMES` en `src/lib/rewards.ts`). Para cambiar lo que pide o paga un sello, cambia `goal` o `coins`, nunca el `id`.
5. **El recordatorio es de cada dispositivo.** Se guarda en IndexedDB con la clave `reminder`, fuera de `Progress`, para que no pase a otro dispositivo al descargar y cargar el progreso. El código lleva claves privadas: nunca lo imprimas ni lo guardes en el repositorio.
6. **Los workflows reciben solo los secretos que usan.** Nunca pases `toJSON(secrets)` a un script: GitHub lo marca como posiblemente malicioso y frena el workflow hasta que alguien lo apruebe. Nombra cada secreto (`${{ secrets.DANZI_RECORDATORIO }}`) y dáselo solo al paso que lo necesita. `tests/workflows.test.ts` lo comprueba.

## Cómo agregar un nivel (por ejemplo, HSK 2)

1. Ejecuta `npm run data:skeleton -- 2`. Esto crea `data-source/drafts/level-2.json` con todas las palabras y los campos en blanco.
2. Completa `es` y `ex` por lotes de unas 50 palabras. Así puedes revisar y hacer commit del borrador por partes.
   - **Significado:** lo más corto y claro posible. Separa acepciones con coma y usos distintos con punto y coma, por ejemplo `"querer; pensar; extrañar"`. En partículas y clasificadores, explica la función: `"clasificador de animales"`.
   - **Ejemplo:** una frase corta y natural que use la palabra.
     - Solo debe usar vocabulario del mismo nivel o de niveles anteriores, salvo nombres propios.
     - Prefiere situaciones cotidianas, y alguna colombiana cuando venga al caso (波哥大).
     - No escribas cifras: usa 八点, no 8点.
   - **Pinyin del ejemplo:**
     - Lleva marcas de tono y agrupa las sílabas por palabras: `Wǒ xǐhuan hē chá.`
     - Marca los tonos neutros sin tilde (`xièxie`, `péngyou`) y aplica los cambios de 一 y 不 (`yí ge`, `bú shì`).
     - Escribe el erhua unido (`nǎr`). Si la prueba no lo reconoce, agrega el carácter anterior a `ERHUA_BEFORE` en `src/lib/compare.ts` (así se agregaron 孩 para 男孩儿 y 天 para 聊天儿). 儿 seguido de 子 no cuenta como erhua (今天儿子 es jīntiān érzi).
     - La prueba compara con `pinyin-pro`, que lee mal algunos caracteres: 地 como partícula (`mànmàn de`), 得 como «tener que» (`děi`) y 还 como «devolver» (`huán`). Escribe la lectura correcta; la prueba la acepta por `ALSO_READ` en `tests/data.test.ts`. Si encuentras otro caso así, agrégalo ahí en lugar de escribir un pinyin incorrecto.
   - **Traducción:** español natural de Colombia, no una traducción palabra por palabra.
3. Cuando el borrador esté completo, muévelo a `src/data/hsk/level-2.json`, ejecuta `npm test` y corrige lo que marquen las pruebas.
4. El nivel aparece solo en Ajustes. No hay que tocar código.

## Interfaz

- Diseño pensado primero para el celular: una columna de máximo 560 px y botones de al menos 44 px.
- Usa los tokens de color de `src/styles.css`. Cada token tiene versión oscura, y ningún componente lleva colores sueltos.
- Los temas de color (`:root[data-accent="…"]`) solo cambian `--accent`, `--on-accent`, `--grid` y `--bar`. Si agregas uno, defínelo en claro y en oscuro, con contraste AA (4,5:1) para el texto y los botones.
- Animaciones: todas están en `src/styles.css` y se apagan con `prefers-reduced-motion`. Ningún cambio de estado puede depender de que una animación termine. Las celebraciones (sellos, protector usado) solo aparecen en Inicio y en Premios, nunca en medio de un repaso.
- Fuentes: Space Grotesk para títulos, Inter para texto y Noto Sans SC para caracteres. Pon `lang="zh-Hans"` en todo texto en chino.
- Accesibilidad:
  - Usa botones reales.
  - Pon `aria-label` en los botones que solo tienen ícono.
  - El color nunca puede ser la única señal: acompáñalo de texto.
- Textos:
  - Directos y en voz activa.
  - Cada botón dice exactamente qué hace.
  - Los errores dicen qué pasó y cómo arreglarlo.

## Despliegue

Cada push a `main` ejecuta `.github/workflows/deploy.yml`, que corre las pruebas, hace el build y publica en GitHub Pages. La app vive en `https://<usuario>.github.io/<repo>/`. `BASE_PATH` se define en el workflow.

`.github/workflows/recordatorios.yml` corre cada hora desde `main` y envía los recordatorios. Cómo se configura está en el README. Cada lunes, su trabajo `mantener-activo` lo vuelve a habilitar con la API de GitHub, para que GitHub no lo pause tras 60 días sin actividad en el repositorio público.

## Flujo de trabajo

- Trabaja en la rama de la sesión. Al terminar: `npm test`, `npm run check` y `npm run build`, luego commit, push y **abre tú el pull request**. El dueño lo fusiona.
- Al fusionarse en `main`, la app se publica sola. No hace falta ejecutar «Publicar en GitHub Pages» a mano.
- Si el pull request de tu rama ya se fusionó, reinicia la rama desde `main` antes de seguir.
- Si GitHub dice que un workflow «may be malicious», el dueño lo revisa y lo aprueba una vez por cada versión del archivo. Mientras tanto no corre, ni siquiera de forma programada.
- En el celular, la app se actualiza sola al abrirla con internet. Si se ve la versión anterior, basta con cerrarla del todo y abrirla de nuevo. Nunca recomiendes borrar los datos del navegador: eso borra el progreso.
- Desde este entorno no se puede abrir la página publicada (la red no llega a `github.io`). Lo que se publicó se ve en el registro del workflow.

## Cómo probar en el navegador

- Chromium y Playwright ya están instalados. Ejecuta `npm run build` y `npx vite preview --port 4173`, y abre `http://localhost:4173/` con `require('playwright')`.
- Para probar con progreso, guárdalo en IndexedDB (base `keyval-store`, almacén `keyval`, clave `progress`) y recarga:

  ```js
  await page.evaluate((data) => new Promise((ok) => {
    const r = indexedDB.open('keyval-store');
    r.onupgradeneeded = () => r.result.createObjectStore('keyval');
    r.onsuccess = () => { const tx = r.result.transaction('keyval', 'readwrite'); tx.objectStore('keyval').put(data, 'progress'); tx.oncomplete = ok; };
  }), progreso);
  await page.reload();
  ```

  Un progreso en un formato anterior (por ejemplo, sin `rewards`) sirve para probar la migración en vivo.
- Revisa a 390 px de ancho, en claro y en oscuro (`colorScheme: 'dark'`) y con `reducedMotion: 'reduce'`.
- Notificaciones:
  - Abre el navegador con `chromium.launch({ channel: 'chromium' })`. El Chromium sin interfaz por defecto siempre las bloquea.
  - `pushManager.subscribe` no funciona aquí, porque no hay conexión con los servidores de Google. Simúlalo en la página con `addInitScript`.
  - Para simular un aviso de GitHub, envíalo al service worker con CDP (`ServiceWorker.deliverPushMessage`). El `registrationId` sale del evento `ServiceWorker.workerRegistrationUpdated`.
  - La entrega real a un celular solo se prueba con «Run workflow» en GitHub.
- En cambios de interfaz, pasa axe (`axe-core`, instalado fuera del proyecto) por las pantallas que cambiaron.

## Pendiente (ideas acordadas, en orden)

1. Sincronización entre dispositivos, con cuenta e inicio de sesión (Supabase). Mientras tanto, el progreso se pasa con Ajustes › Descargar y Cargar archivo (que ya incluye monedas, sellos y temas). Con la cuenta, el recordatorio también podría registrarse solo, sin pegar el código en GitHub.
2. Estadísticas de retención y tiempo de estudio.
