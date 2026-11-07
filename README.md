# Danzi

App para aprender chino mandarín desde el español, siguiendo el temario oficial del **HSK 3.0**. Se instala en el celular desde el navegador y funciona sin internet.

- **Tarjetas** con repaso espaciado (FSRS, el algoritmo de Anki): carácter al frente; pinyin, significado y ejemplo al voltear.
- **Escritura** con el dedo, trazo a trazo, con su propio repaso espaciado. Los trazos se descargan al instalar la app, así que también funciona sin internet.
- **Habla**: ejercicios de tonos de oído y frases para repetir. El micrófono revisa tu pronunciación en Chrome y Safari.
- **Palabras**: buscador por chino, pinyin o español.
- **Recordatorio diario**: a la hora que elijas, una notificación con tu racha y las tarjetas pendientes. Hay que configurarlo una vez (ver abajo).
- Progreso guardado en el dispositivo, con opción de descargarlo y cargarlo en otro.

Hoy incluye el **HSK 1 (300 palabras), el HSK 2 (200) y el HSK 3 (500)**, completos. Los siguientes niveles se agregan con `npm run data:skeleton` (ver `CLAUDE.md`).

## Uso

```bash
npm install
npm run dev     # http://localhost:5173
npm test
npm run build
```

### Instalar en el celular

Abre la dirección de GitHub Pages en Chrome (Android) o Safari (iPhone):

- **Android:** menú › **Instalar app**.
- **iPhone:** Compartir › **Agregar a pantalla de inicio**.

### Activar el recordatorio diario

Una app web publicada en GitHub Pages no puede programar notificaciones sola. Por eso el aviso lo envía un workflow de GitHub Actions (`.github/workflows/recordatorios.yml`), que corre cada hora y le avisa a cada dispositivo a la hora que eligió. Se configura una vez por dispositivo:

1. En el celular, abre Danzi y entra a **Ajustes › Recordatorio diario**. Elige la hora, toca **Activar recordatorio** y permite las notificaciones.
   - **iPhone:** primero agrega Danzi a la pantalla de inicio y ábrela desde ese ícono (iOS 16.4 o más reciente).
2. Toca **Copiar código**.
3. En el repositorio de GitHub, entra a **Settings › Secrets and variables › Actions › New repository secret**. En **Name** escribe `DANZI_RECORDATORIO` (para otro dispositivo, `DANZI_RECORDATORIO_2`, etc.), pega el código en **Secret** y guarda.
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

## Créditos

- Vocabulario: 《HSK考试大纲》 (2025), Centro de Educación y Cooperación Lingüística (CLEC). Más detalles en `data-source/README.md`.
- Trazos: [Hanzi Writer](https://hanziwriter.org) y [Make Me a Hanzi](https://github.com/skishore/makemeahanzi) (licencia Arphic Public License).
- Significados y ejemplos en español escritos para esta app.
