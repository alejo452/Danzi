// Genera los íconos de la APK de Android a partir de public/icon.svg (el carácter 汉 sobre rojo):
// - res/drawable/ic_launcher_foreground.xml: el carácter en blanco para el ícono adaptable
//   (el fondo rojo es @color/ic_launcher_background). También se usa en la pantalla de inicio.
// - res/drawable/ic_stat_danzi.xml: el carácter para la barra de notificaciones.
// - res/mipmap-*/ic_launcher.png e ic_launcher_round.png: íconos para Android 7, que no usa los adaptables.
//
// Uso: node scripts/android-icons.mjs
// Los PNG se dibujan con Playwright (Chromium). Si no está instalado, solo se generan los vectores.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const RES = 'android/app/src/main/res';
const svg = fs.readFileSync('public/icon.svg', 'utf8');
const paths = [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
if (!paths.length) throw new Error('public/icon.svg no tiene trazados');

// Caja del carácter en sus coordenadas, ya volteadas como en el SVG: translate(0,900) scale(1,-1).
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
for (const d of paths) {
  const n = d.match(/-?\d+(\.\d+)?/g).map(Number);
  for (let i = 0; i < n.length; i += 2) {
    minX = Math.min(minX, n[i]);
    maxX = Math.max(maxX, n[i]);
    minY = Math.min(minY, 900 - n[i + 1]);
    maxY = Math.max(maxY, 900 - n[i + 1]);
  }
}
const cx = (minX + maxX) / 2;
const cy = (minY + maxY) / 2;
const side = Math.max(maxX - minX, maxY - minY);

/** El carácter centrado en un lienzo de 1024, con su lado más largo ocupando `fraction` del lienzo. */
function vector(dp, fraction, note) {
  const s = (fraction * 1024) / side;
  const r = (x) => Math.round(x * 1000) / 1000;
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- ${note} Generado por scripts/android-icons.mjs a partir de public/icon.svg. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="${dp}dp"
    android:height="${dp}dp"
    android:viewportWidth="1024"
    android:viewportHeight="1024">
    <group
        android:translateX="${r(512 - s * cx)}"
        android:translateY="${r(512 - s * cy)}"
        android:scaleX="${r(s)}"
        android:scaleY="${r(s)}">
        <group android:translateY="900" android:scaleY="-1">
${paths.map((d) => `            <path android:fillColor="#FFFFFF" android:pathData="${d}" />`).join('\n')}
        </group>
    </group>
</vector>
`;
}

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  console.log('Escrito', file);
}

// Ícono adaptable: el lienzo es de 108 dp y solo el círculo central de 66 dp es siempre visible.
write(`${RES}/drawable/ic_launcher_foreground.xml`, vector(108, 0.465, 'Carácter del ícono adaptable.'));
// Barra de notificaciones: 24 dp, con un margen pequeño.
write(`${RES}/drawable/ic_stat_danzi.xml`, vector(24, 0.84, 'Ícono pequeño de las notificaciones.'));

const DENSITIES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {
  console.log('Playwright no está instalado: no se generaron los PNG de Android 7.');
  process.exit(0);
}
const round = svg.replace(/<rect [^>]*\/>/, '<circle cx="512" cy="512" r="512" fill="#C8372D"/>');
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [density, size] of Object.entries(DENSITIES)) {
  await page.setViewportSize({ width: size, height: size });
  for (const [name, markup] of [['ic_launcher', svg], ['ic_launcher_round', round]]) {
    const sized = markup.replace('<svg ', `<svg width="${size}" height="${size}" `);
    await page.setContent(`<html><body style="margin:0;background:transparent">${sized}</body></html>`);
    const file = `${RES}/mipmap-${density}/${name}.png`;
    await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    console.log('Dibujado', file);
  }
}
await browser.close();
