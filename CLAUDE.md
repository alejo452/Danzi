# Danzi — guía para Claude

App para aprender chino mandarín desde el español, siguiendo el **HSK 3.0** (《HSK考试大纲》, noviembre de 2025). Es una app web instalable (PWA) que también se empaqueta como APK de Android con Capacitor: es el mismo código. La usa Diego, estudiante colombiano, sobre todo desde su celular Android. Toda la interfaz está en **español de Colombia, tuteando**.

## Comandos

- `npm run dev`: servidor local.
- `npm test`: pruebas (datos, repaso espaciado, voz, recordatorios). **Deben pasar antes de cada commit.**
- `npm run check`: revisión de tipos.
- `npm run build`: build de producción (copia antes los datos de trazos a `public/strokes/`).
- `npm run data:skeleton -- <nivel>`: crea el borrador de un nivel desde el temario oficial.
- `node scripts/draft-tool.mjs`: completa un borrador por lotes y lo publica cuando está completo (`estado`, `siguientes`, `aplicar`, `publicar`; ver «Cómo agregar un nivel»).
- `npm run android:sync`: build de la web y copia a la app de Android (`cap sync android`).
- APK: en `android/`, `./gradlew assembleDebug` compila «Danzi Pruebas» y `./gradlew assembleRelease` la normal (sale firmada solo si `DANZI_FIRMA_ANDROID` está definido). Necesita Java 21 y el SDK de Android en `ANDROID_HOME`. En la nube, el entorno «Danzi» permite `dl.google.com`; si el SDK no está, descarga `cmdline-tools` de `https://dl.google.com/android/repository/` en `$ANDROID_HOME/cmdline-tools/latest` y ejecuta `sdkmanager --install "platform-tools" "platforms;android-36" "build-tools;36.0.0"`.
- `npm run icons`: dibuja todos los íconos (web, Android y recordatorios) a partir de Xi Bao (`scripts/icons.mjs`, necesita Playwright).

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
- Xi Bao (喜宝, «tesoro alegre»), el panda de la app:
  - `src/lib/mascot.ts`: sus frases (chino, pinyin con tonos y español) y qué dice en Inicio según el día (`homeLine`: primera vez, racha en riesgo desde las 5 p. m., meta cumplida, noche…). Funciones puras.
  - `src/components/XiBao.tsx`: el dibujo SVG, con seis estados de ánimo (`hola`, `listo`, `animado`, `feliz`, `preocupado`, `dormido`). `face` muestra solo la cabeza.
  - `src/components/MascotCard.tsx`: `MascotCard` (Inicio: globo con lo que dice; al tocarlo, una frase en chino en voz alta) y `MascotSays` (pantallas de «listo» de Repasar, Escribir y Hablar).
  - Es el ícono de la app: `scripts/icons.mjs` dibuja su cara sobre el rojo de Danzi para la web (`public/icon*`), para Android (íconos adaptables, redondos y temáticos, y la pantalla de inicio) y para los recordatorios (`public/xibao-192.png`, `public/badge-96.png` y `xibao_aviso.png`).
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
- APK de Android (Capacitor 8):
  - `capacitor.config.ts` y `android/`: el proyecto de Android (id `io.github.alejo452.danzi`). `cap sync` copia `dist/` a `android/app/src/main/assets/public`, que no va en git. La compilación de pruebas (`debug`) se llama «Danzi Pruebas» y usa el id `….pruebas`, así que se instala al lado de la normal con su propio progreso.
  - `src/lib/native.ts`: `isNative`, que dice si la app corre dentro de la APK. Todo el código propio de la APK está en `src/native/` y se importa solo con `import()` cuando `isNative` es true.
  - Recordatorio de la APK: el celular lo programa con `@capacitor/local-notifications`, sin GitHub. `src/lib/localReminders.ts` decide los avisos de los próximos 14 días (funciones puras); `src/native/reminders.ts` los programa y se reprograma cuando cambia el progreso; `src/components/LocalReminderPanel.tsx` es su sección de Ajustes. La hora se guarda en IndexedDB con la clave `reminder-local`.
  - `src/native/speech.ts`: en la APK, la voz usa los motores de Android (`@capacitor-community/text-to-speech` y `speech-recognition`), porque la vista web de Android no trae la voz de Chrome. `src/lib/speech.ts` elige cuál usar.
  - Actualización automática de la APK (`@capgo/capacitor-updater` en modo manual, sin los servidores de Capgo):
    - `src/native/updates.ts`: al abrir la app confirma que la versión arrancó (`notifyAppReady`), busca en Releases `actualizacion.json`, descarga `danzi-web.zip` (el plugin comprueba su SHA-256) y lo deja para la próxima vez que la app pase a segundo plano. Si una versión nueva no confirma en 15 segundos, el plugin vuelve a la anterior y esa versión no se reintenta. «Danzi Pruebas» no se actualiza sola.
    - `src/lib/updates.ts`: funciones puras (leer el aviso, decidir qué hacer, la versión de la APK a partir de su `versionName`). El estado se guarda en IndexedDB con la clave `actualizacion`, fuera de `Progress`.
    - `src/components/UpdatePanel.tsx`: Ajustes › Actualizaciones, con la versión, el estado y, si hace falta, el enlace a la APK nueva.
    - `scripts/update-manifest.mjs`: arma `actualizacion.json` en el workflow (ver Despliegue).
    - La versión de la parte web es `__DANZI_VERSION__`, que `vite.config.ts` toma de `DANZI_VERSION` (el número de ejecución del workflow, el mismo de la APK). En las compilaciones locales vale 0 y la app no busca actualizaciones.
  - `src/native/files.ts` y `android/app/src/main/java/io/github/alejo452/danzi/SaveFilePlugin.java`: en la APK, «Descargar» abre el diálogo «Guardar en…» de Android, porque la vista web no descarga archivos. `MainActivity.java` registra ese complemento y pone el fondo de la app mientras carga.
  - `scripts/android-signing.mjs` (crea y lee el código de la llave de firma) y `android/firma-sha256.txt` (huella pública de la llave).
  - `.github/workflows/android.yml`: compila y publica la APK (ver Despliegue).

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
7. **La APK no cambia de identidad.**
   - No cambies el `appId` (`io.github.alejo452.danzi`) ni el origen de la página (Capacitor la sirve desde `https://localhost`): el progreso de la APK vive en ese origen.
   - La llave de firma (secreto `DANZI_FIRMA_ANDROID`, huella en `android/firma-sha256.txt`) no se cambia, nunca se imprime y nunca se guarda en el repositorio. Con otra llave, Android no deja instalar la versión nueva encima.
   - Nunca recomiendes desinstalar la APK normal: desinstalarla borra el progreso. «Danzi Pruebas» sí se puede desinstalar.
   - No quites `notifyAppReady` del arranque (`startUpdates` en `App.tsx`): sin él, el plugin cree que la versión falló y vuelve a la anterior. No cambies el formato de `versionName` (`1.<número>`, con `-pruebas` en «Danzi Pruebas»): de ahí sale la versión de la APK.
   - Las estadísticas y búsquedas de Capgo están apagadas (`statsUrl`, `updateUrl` y `channelUrl` vacíos en `capacitor.config.ts`). No las actives: mandarían datos del celular a un servidor ajeno.
8. **La versión web no carga código de la APK.** Lo de Android va en `src/native/` y se importa con `import()` detrás de `isNative`. `vite.config.ts` nombra esos archivos `native-*.js` y el service worker no los guarda. No uses `manualChunks`: arrastra módulos compartidos a esos archivos y la web los cargaría al abrir. Después de tocarlo, revisa que `dist/assets/index-*.js` no tenga un `import … from "./native-…"`.

## Cómo agregar un nivel (por ejemplo, HSK 2)

1. Ejecuta `npm run data:skeleton -- 2`. Esto crea `data-source/drafts/level-2.json` con todas las palabras y los campos en blanco.
2. Completa `es` y `ex` por lotes de unas 50 palabras. Así puedes revisar y hacer commit del borrador por partes.
   - `node scripts/draft-tool.mjs siguientes 2 50` lista las siguientes palabras sin completar. Escribe el lote en un archivo, una palabra por línea con los campos separados por tabuladores (id, significado, frase, pinyin de la frase, traducción), y cópialo al borrador con `node scripts/draft-tool.mjs aplicar 2 <archivo>`. `estado` dice cuántas faltan.
   - `tests/drafts.test.ts` revisa las entradas completadas con las mismas reglas de `tests/data.test.ts`, y además que la frase solo use caracteres de palabras del mismo nivel o de niveles anteriores. Los únicos caracteres que se aceptan fuera de esa lista son los de nombres propios colombianos, en `PROPER_NAME_CHARS`.
   - **Significado:** lo más corto y claro posible. Separa acepciones con coma y usos distintos con punto y coma, por ejemplo `"querer; pensar; extrañar"`. En partículas y clasificadores, explica la función: `"clasificador de animales"`.
   - **Ejemplo:** una frase corta y natural que use la palabra.
     - Solo debe usar vocabulario del mismo nivel o de niveles anteriores, salvo nombres propios.
     - Prefiere situaciones cotidianas, y alguna colombiana cuando venga al caso (波哥大).
     - No escribas cifras: usa 八点, no 8点.
   - **Pinyin del ejemplo:**
     - Lleva marcas de tono y agrupa las sílabas por palabras: `Wǒ xǐhuan hē chá.`
     - Marca los tonos neutros sin tilde (`xièxie`, `péngyou`) y aplica los cambios de 一 y 不 (`yí ge`, `bú shì`).
     - Escribe el erhua unido (`nǎr`). Si la prueba no lo reconoce, agrega el carácter anterior a `ERHUA_BEFORE` en `src/lib/compare.ts` (así se agregaron 孩 para 男孩儿 y 天 para 聊天儿). 儿 seguido de 子 no cuenta como erhua (今天儿子 es jīntiān érzi).
     - La prueba compara con `pinyin-pro`, que lee mal algunos caracteres, por ejemplo 地 como partícula (`mànmàn de`), 得 como «tener que» (`děi`) o 还 como «devolver» (`huán`). Escribe la lectura correcta; la prueba la acepta por `ALSO_READ` en `tests/syllables.ts`, que tiene la lista completa. Si encuentras otro caso así, agrégalo ahí en lugar de escribir un pinyin incorrecto.
   - **Traducción:** español natural de Colombia, no una traducción palabra por palabra.
3. Cuando el borrador esté completo, `node scripts/draft-tool.mjs publicar 2` lo pasa a `src/data/hsk/level-2.json` (una palabra por línea, como los otros niveles) y borra el borrador. Luego ejecuta `npm test` y corrige lo que marquen las pruebas.
4. El nivel aparece solo en Ajustes. No hay que tocar código.

## Interfaz

- Diseño pensado primero para el celular: una columna de máximo 560 px y botones de al menos 44 px.
- Usa los tokens de color de `src/styles.css`. Cada token tiene versión oscura, y ningún componente lleva colores sueltos.
- Los temas de color (`:root[data-accent="…"]`) solo cambian `--accent`, `--on-accent`, `--grid` y `--bar`. Si agregas uno, defínelo en claro y en oscuro, con contraste AA (4,5:1) para el texto y los botones.
- Animaciones: todas están en `src/styles.css` y se apagan con `prefers-reduced-motion`. Ningún cambio de estado puede depender de que una animación termine. Las celebraciones (sellos, protector usado) solo aparecen en Inicio y en Premios, nunca en medio de un repaso.
- Fuentes: Space Grotesk para títulos, Inter para texto y Noto Sans SC para caracteres. Pon `lang="zh-Hans"` en todo texto en chino.
- Xi Bao:
  - Es amigable y anima; nunca regaña ni hace sentir mal. Habla en español de Colombia, tuteando, y cada cosa que dice lleva una frase corta en chino con su pinyin y su traducción.
  - Las frases nuevas van en `src/lib/mascot.ts`. `tests/mascot.test.ts` revisa su pinyin sílaba por sílaba, con tonos, contra `pinyin-pro`. Si un carácter va en tono neutro y `pinyin-pro` le pone tono (意思 yìsi, 朋友 péngyou), agrégalo a `NEUTRAL_OK` en esa prueba.
  - Sus colores son los tokens `--panda-*` (con versión oscura) y su bufanda usa `--accent`, así que cambia con el tema. Si cambias el dibujo, ejecuta `npm run icons` para actualizar el ícono de la app y las imágenes del recordatorio.
- En la APK: no hay service worker, «Descargar» usa `SaveFile`, «Cargar archivo» no filtra por tipo (Android a veces guarda el JSON con otro tipo) y las secciones que solo aplican a la web (como «Escritura sin internet») se esconden con `isNative`.
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

`.github/workflows/recordatorios.yml` corre cada hora desde `main` y envía los recordatorios de la versión web. Cómo se configura está en el README. Cada lunes, su trabajo `mantener-activo` lo vuelve a habilitar con la API de GitHub, para que GitHub no lo pause tras 60 días sin actividad en el repositorio público.

`.github/workflows/android.yml` compila la APK:
- En cada push a `main` (salvo cambios solo en `.md`), firma la APK normal con `DANZI_FIRMA_ANDROID`, comprueba que la huella coincida con `android/firma-sha256.txt` y la publica en Releases como `danzi.apk`. El enlace fijo es `https://github.com/alejo452/Danzi/releases/latest/download/danzi.apk`. `versionCode` es el número de ejecución del workflow, que siempre sube.
- Junto a `danzi.apk` publica `danzi-web.zip` (el `dist/` de esa misma compilación) y `actualizacion.json` (versión, URL del zip, SHA-256 y `apkMinima`). `apkMinima` es la APK más antigua que puede usar esa parte web: `scripts/update-manifest.mjs` calcula una huella de la parte de Android (archivos de `android/` en el commit, `capacitor.config.ts` y versiones de los complementos de Capacitor) y, si es la misma del aviso anterior, mantiene su `apkMinima`; si cambió, la sube a esta versión y las APK anteriores piden instalar la nueva.
- En cada pull request compila «Danzi Pruebas» y la deja como artefacto `danzi-pruebas`, sin secretos.

## Flujo de trabajo

- Trabaja en la rama de la sesión. Al terminar: `npm test`, `npm run check` y `npm run build`, luego commit, push y **abre tú el pull request**. El dueño lo fusiona.
- Al fusionarse en `main`, la app se publica sola. No hace falta ejecutar «Publicar en GitHub Pages» a mano.
- Si el pull request de tu rama ya se fusionó, reinicia la rama desde `main` antes de seguir.
- Si GitHub dice que un workflow «may be malicious», el dueño lo revisa y lo aprueba una vez por cada versión del archivo. Mientras tanto no corre, ni siquiera de forma programada.
- En el celular, la app web se actualiza sola al abrirla con internet. Si se ve la versión anterior, basta con cerrarla del todo y abrirla de nuevo. Nunca recomiendes borrar los datos del navegador: eso borra el progreso.
- La APK se actualiza sola al abrirla (Ajustes › Actualizaciones). Solo cuando cambia la parte de Android hay que instalar la APK nueva encima, desde Releases; la app lo dice y trae el enlace. Nunca recomiendes desinstalarla ni borrar sus datos.
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
- Pantallas de la APK en el navegador: con `addInitScript`, define `window.androidBridge = {}` y un `window.Capacitor` con:
  - `isNativePlatform: () => true`;
  - `PluginHeaders`: el nombre y los métodos de cada complemento, con `rtype: 'promise'`, y `addListener` con otro `rtype`;
  - `nativePromise(plugin, método, opciones)` y `nativeCallback(plugin, método, opciones, callback)`, que responden como el celular.

  Así `isNative` es true y las llamadas a los complementos llegan a tus funciones simuladas. Las notificaciones, la voz y «Guardar en…» de verdad solo se prueban en el celular.
- Actualización automática en el navegador: compila con `DANZI_VERSION=<número>` y simula `CapacitorUpdater` (`notifyAppReady`, `getFailedUpdate`, `getBuiltinVersion` con `{ version: '1.<número>' }`, `getNextBundle`, `download`, `next`) y `CapacitorHttp.get`, que devuelve el `actualizacion.json` de cada caso. Para recargar con el `addInitScript` puesto, cambia algo más que el `#` de la dirección (por ejemplo `?r=1#ajustes`): si solo cambia el `#`, la página no se recarga.

## Pendiente (ideas acordadas, en orden)

1. APK, tercera parte: «Danzi Pruebas» recibe la versión de cada pull request para probarla en el celular antes de fusionar, con una llave de prueba fija para no tener que desinstalarla entre versiones.
2. Sincronización entre dispositivos, con cuenta e inicio de sesión (Supabase). Mientras tanto, el progreso se pasa con Ajustes › Descargar y Cargar archivo (que ya incluye monedas, sellos y temas).
3. Estadísticas de retención y tiempo de estudio.
