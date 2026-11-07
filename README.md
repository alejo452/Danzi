# Danzi

App para aprender chino mandarín desde el español, siguiendo el temario oficial del **HSK 3.0**. Se instala en el celular desde el navegador y funciona sin internet.

- **Tarjetas** con repaso espaciado (FSRS, el algoritmo de Anki): carácter al frente; pinyin, significado y ejemplo al voltear.
- **Escritura** con el dedo, trazo a trazo, con su propio repaso espaciado.
- **Habla**: ejercicios de tonos de oído y frases para repetir. El micrófono revisa tu pronunciación en Chrome y Safari.
- **Palabras**: buscador por chino, pinyin o español.
- Progreso guardado en el dispositivo, con opción de descargarlo y cargarlo en otro.

Hoy incluye el **HSK 1 completo (300 palabras)**. Los siguientes niveles se agregan con `npm run data:skeleton` (ver `CLAUDE.md`).

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

## Publicación

Cada push a `main` publica la app en GitHub Pages con `.github/workflows/deploy.yml`. Solo la primera vez, en el repositorio de GitHub, entra a **Settings › Pages** y en **Source** elige **GitHub Actions**.

## Créditos

- Vocabulario: 《HSK考试大纲》 (2025), Centro de Educación y Cooperación Lingüística (CLEC). Más detalles en `data-source/README.md`.
- Trazos: [Hanzi Writer](https://hanziwriter.org) y [Make Me a Hanzi](https://github.com/skishore/makemeahanzi) (licencia Arphic Public License).
- Significados y ejemplos en español escritos para esta app.
