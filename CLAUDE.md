# Hanzi Diario — guía para Claude

App web instalable (PWA) para aprender chino mandarín desde el español, siguiendo el **HSK 3.0** (《HSK考试大纲》, noviembre de 2025). La usa Diego, estudiante colombiano, sobre todo desde el celular. Toda la interfaz está en **español de Colombia, tuteando**.

## Comandos

- `npm run dev`: servidor local.
- `npm test`: pruebas (datos, repaso espaciado, voz). **Deben pasar antes de cada commit.**
- `npm run check`: revisión de tipos.
- `npm run build`: build de producción (copia antes los datos de trazos a `public/strokes/`).
- `npm run data:skeleton -- <nivel>`: crea el borrador de un nivel desde el temario oficial.

## Estructura

- `src/App.tsx`: navegación por pestañas (`#inicio`, `#repasar`, `#escribir`, `#hablar`, `#palabras`, `#ajustes`).
- `src/views/`: una vista por pestaña.
- `src/lib/srs.ts`: repaso espaciado con FSRS (`ts-fsrs`). Pasos de aprendizaje: 1 min y 10 min.
- `src/lib/queue.ts`: qué tarjeta toca y cuántas quedan hoy. Sirve para los dos mazos: lectura (`read`) y escritura (`write`).
- `src/lib/progress.ts`: modelo del progreso, con funciones puras. `src/lib/useProgress.ts` lo guarda en IndexedDB.
- `src/lib/speech.ts`: lectura en voz alta y reconocimiento de voz en chino.
- `src/lib/compare.ts`: compara lo que entendió el reconocimiento con la frase objetivo, por sílabas de pinyin.
- `src/lib/tones.ts`: ejercicio de tonos.
- `src/data/levels.ts`: lista de niveles. Un nivel está disponible si existe `src/data/hsk/level-<id>.json`.
- `data-source/hsk-2025-syllabus.json`: temario oficial completo, con 11 000 palabras en filas `[id, nivel, hanzi, pinyin, categoría]`. No editarlo.
- `scripts/build-strokes.mjs`: copia los trazos de `hanzi-writer-data` solo para los caracteres del vocabulario.

## Reglas que no se rompen

1. **El progreso es del usuario.** Vive en IndexedDB y no se puede recuperar si se pierde.
   - Las tarjetas se identifican por el `id` del temario. Nunca cambies ni reutilices un `id`.
   - Si cambias el formato de `Progress`, sube `PROGRESS_VERSION` y agrega la migración en `normalizeProgress`. Agrega también una prueba que convierta datos del formato anterior.
2. **Los datos de un nivel solo entran a `src/data/hsk/` completos.** Las pruebas de `tests/data.test.ts` exigen tres cosas:
   - Que estén exactamente las palabras del temario para ese nivel, con su hanzi, pinyin y categoría sin cambios.
   - Que cada palabra tenga significado en español y un ejemplo completo (`zh`, `py`, `es`) que la use.
   - Que el pinyin del ejemplo tenga las mismas sílabas que el texto chino.
3. **No inventes datos del temario.** Si algo no cuadra con el temario, dilo en lugar de corregirlo a mano.

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
     - Escribe el erhua unido (`nǎr`).
   - **Traducción:** español natural de Colombia, no una traducción palabra por palabra.
3. Cuando el borrador esté completo, muévelo a `src/data/hsk/level-2.json`, ejecuta `npm test` y corrige lo que marquen las pruebas.
4. El nivel aparece solo en Ajustes. No hay que tocar código.

## Interfaz

- Diseño pensado primero para el celular: una columna de máximo 560 px y botones de al menos 44 px.
- Usa los tokens de color de `src/styles.css`. Cada token tiene versión oscura, y ningún componente lleva colores sueltos.
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

## Pendiente (ideas acordadas, en orden)

1. Niveles HSK 2 y HSK 3 con significados y ejemplos.
2. Sincronización entre dispositivos, con cuenta e inicio de sesión (Supabase). Mientras tanto, el progreso se pasa con Ajustes › Descargar y Cargar archivo.
3. Estadísticas de retención y tiempo de estudio.
