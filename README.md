# Danzi

App para aprender chino mandarín desde el español, siguiendo el temario oficial del **HSK 3.0**. Funciona sin internet. En Android se instala como app (APK); en cualquier celular, también desde el navegador.

- **Xi Bao (喜宝)**, el panda de Danzi: te saluda, te anima según cómo va tu día y, si lo tocas, te dice una frase en chino en voz alta, con su pinyin y su traducción. También te escribe el recordatorio.
- **Tarjetas** con repaso espaciado (FSRS, el algoritmo de Anki): carácter al frente; pinyin, significado y ejemplo al voltear.
- **Escritura** con el dedo, trazo a trazo, con su propio repaso espaciado. Los trazos se descargan al instalar la app, así que también funciona sin internet.
- **Habla**: ejercicios de tonos de oído y frases para repetir. El micrófono revisa tu pronunciación en Chrome y Safari.
- **Palabras**: buscador por chino, pinyin o español.
- **Recordatorio diario**: a la hora que elijas, una notificación con tu racha y las tarjetas pendientes. En la APK de Android lo programa el celular; en la versión web hay que configurarlo una vez (ver abajo).
- **Racha y premios**:
  - Al tocar la racha se abre un calendario del mes.
  - Practicar da monedas (铜钱), y cumplir la meta diaria abre un sobre rojo (红包).
  - Hay 20 sellos (印章) para coleccionar.
  - En la tienda hay protectores de racha y temas de color.
- Progreso guardado en el dispositivo, con opción de descargarlo y cargarlo en otro.

Hoy incluye el **HSK 1 (300 palabras), el HSK 2 (200), el HSK 3 (500) y el HSK 4 (1000)**, completos. Los siguientes niveles se agregan con `npm run data:skeleton` (ver `CLAUDE.md`).

## Uso

```bash
npm install
npm run dev     # http://localhost:5173
npm test
npm run build
```

### Instalar en el celular

- **Android:** instala la APK (ver abajo).
- **Cualquier celular, desde el navegador:** abre la dirección de GitHub Pages en Chrome o Safari y elige menú › **Instalar app** (Android) o Compartir › **Agregar a pantalla de inicio** (iPhone).

### App para Android (APK)

Es la misma app, instalada como app de Android. Funciona sin internet, y el recordatorio lo programa el propio celular: no depende de GitHub ni hay que pegar ningún código.

**Instalarla o actualizarla:**

1. En el celular, abre https://github.com/alejo452/Danzi/releases/latest/download/danzi.apk (o entra a **Releases**, abre la versión más reciente y toca `danzi.apk`).
2. Abre el archivo descargado. La primera vez, Android pide permitir **Instalar apps desconocidas** para Chrome o para Archivos: permítelo y toca **Instalar**.
3. Para actualizarla, descarga la APK nueva e instálala encima. El progreso se queda.

**Nunca desinstales la APK: desinstalarla borra el progreso.** Si Android dice que no puede instalar una versión nueva, no la desinstales para intentarlo de nuevo.

**Pasar el progreso desde la versión web** (una sola vez):

1. En la app web, entra a **Ajustes › Tu progreso › Descargar**.
2. En la APK, entra a **Ajustes › Tu progreso › Cargar archivo**, elige ese archivo y toca **Reemplazar**.
3. Revisa que estén tu racha, tus monedas y tus sellos. Hasta comprobarlo, no borres la app web ni sus datos.

**Recordatorio:** en la APK, entra a **Ajustes › Recordatorio diario** y toca **Activar recordatorio**. Si ese día ya practicaste, no te avisa. Cuando te funcione, borra el secreto `DANZI_RECORDATORIO` en GitHub para que no te lleguen dos avisos.

**Voz:** la APK usa los motores de voz de Android. Si en **Hablar** aparece «Falta la voz en chino», toca **Instalar la voz en chino** y descarga la voz en chino (China). El reconocimiento de voz usa la app de Google.

**Versión de pruebas:** cada pull request compila «Danzi Pruebas», que se instala al lado de la app normal, con su propio progreso. Se descarga en el pull request, en **Checks › APK de Android › Artifacts › danzi-pruebas** (viene dentro de un .zip). Cada compilación de prueba lleva su propia firma: para instalar una nueva, primero desinstala la «Danzi Pruebas» anterior (nunca la normal).

**La llave de firma** (una sola vez, antes de la primera versión): todas las versiones de la APK se firman con la misma llave. Vive en el secreto `DANZI_FIRMA_ANDROID` (**Settings › Secrets and variables › Actions**), y conviene guardar una copia del archivo en un lugar seguro, como tu Google Drive: si se pierde, la APK ya no se puede actualizar. Su huella, que es pública, está en `android/firma-sha256.txt`, y el workflow no publica una APK firmada con otra llave.

**Compilar en tu computador** (necesitas Java 21 y el SDK de Android):

```bash
npm run android:sync
```

```bash
cd android && ./gradlew assembleDebug
```

La APK de pruebas queda en `android/app/build/outputs/apk/debug/`.

### Activar el recordatorio diario (versión web)

Una app web publicada en GitHub Pages no puede programar notificaciones sola. Por eso el aviso lo envía un workflow de GitHub Actions (`.github/workflows/recordatorios.yml`), que corre cada hora y le avisa a cada dispositivo a la hora que eligió. Se configura una vez por dispositivo:

1. En el celular, abre Danzi y entra a **Ajustes › Recordatorio diario**. Elige la hora, toca **Activar recordatorio** y permite las notificaciones.
   - **iPhone:** primero agrega Danzi a la pantalla de inicio y ábrela desde ese ícono (iOS 16.4 o más reciente).
2. Toca **Copiar código**.
3. En el repositorio de GitHub, entra a **Settings › Secrets and variables › Actions › New repository secret**. En **Name** escribe `DANZI_RECORDATORIO` (para otros dispositivos, `DANZI_RECORDATORIO_2` y `DANZI_RECORDATORIO_3`), pega el código en **Secret** y guarda.
4. Para probar, entra a **Actions › Recordatorios diarios › Run workflow**. En un par de minutos llega un aviso de prueba.

Si cambias la hora en la app, el código cambia: reemplaza el secreto con el código nuevo.

Si no llega el aviso:

1. En el celular, abre Danzi desde el ícono de la pantalla de inicio (no desde el navegador) y entra a **Ajustes › Recordatorio diario**.
2. Toca **Probar notificación**. Si no aparece nada, el celular está bloqueando las notificaciones: permite las de Danzi y las de Chrome en los ajustes del celular.
3. Lee lo que dice el panel:
   - «Último aviso recibido…»: el envío desde GitHub funciona.
   - «Todavía no ha recibido avisos de GitHub»: el aviso no llegó. Revisa el registro de **Actions › Recordatorios diarios**, que dice qué respondió el servicio de avisos.
   - «El celular canceló los avisos de Danzi»: toca **Activar de nuevo** y reemplaza el secreto con el código nuevo.

Ten en cuenta:

- El workflow solo corre desde `main`.
- GitHub puede retrasar unos minutos las ejecuciones programadas.
- En repositorios públicos, GitHub pausa los workflows programados si el repositorio pasa 60 días sin cambios. Para evitarlo, el mismo workflow se vuelve a habilitar solo cada lunes (trabajo «mantener-activo»). Para comprobarlo a mano, entra a **Actions › Recordatorios diarios › Run workflow**, desmarca «probar» y marca «mantener». Si aun así GitHub lo pausara, te avisa por correo y se reactiva en **Actions › Recordatorios diarios › Enable workflow**.

## Publicación

Cada push a `main` publica la app en GitHub Pages con `.github/workflows/deploy.yml`. Solo la primera vez, en el repositorio de GitHub, entra a **Settings › Pages** y en **Source** elige **GitHub Actions**.

Cada push a `main` también compila la APK firmada y la publica en **Releases** (`.github/workflows/android.yml`). Necesita el secreto `DANZI_FIRMA_ANDROID`.

## Créditos

- Vocabulario: 《HSK考试大纲》 (2025), Centro de Educación y Cooperación Lingüística (CLEC). Más detalles en `data-source/README.md`.
- Trazos: [Hanzi Writer](https://hanziwriter.org) y [Make Me a Hanzi](https://github.com/skishore/makemeahanzi) (licencia Arphic Public License).
- Significados y ejemplos en español escritos para esta app.
