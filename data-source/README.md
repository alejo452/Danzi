# Fuentes de datos

## `hsk-2025-syllabus.json`

Las 11 000 palabras del 《HSK考试大纲》 (temario del examen HSK 3.0), publicado en noviembre de 2025 por el Centro de Educación y Cooperación Lingüística (CLEC). Cada fila es `[id, nivel, hanzi, pinyin, categoría]`.

Por nivel trae 300, 200, 500, 1000, 1600 y 1800 palabras, y 5600 para el bloque 7–9.

Se tomó de la transcripción del temario en [hsk-3.0-vocabulary-dataset](https://github.com/uranbekanarbaev/hsk-3.0-vocabulary-dataset), revisada el 28 de septiembre de 2026. Para el HSK 1 se comparó con la lista de [krmanik/HSK-3.0](https://github.com/krmanik/HSK-3.0): coinciden las 300 palabras.

Los derechos del temario son del CLEC y de Chinese Testing International. Aquí se usa como lista de referencia para una app de estudio personal.

## `drafts/`

Aquí van los borradores de niveles en preparación, creados con `npm run data:skeleton -- <nivel>`. Cuando un borrador está completo, pasa a `src/data/hsk/`.
