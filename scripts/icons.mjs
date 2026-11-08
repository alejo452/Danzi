// Íconos de Danzi, dibujados a partir de Xi Bao (src/components/XiBao.tsx): su cara sobre el rojo de la app.
//
// Web (public/):
// - icon.svg, icon-192.png, icon-512.png: la cara sobre un cuadrado rojo redondeado.
// - icon-maskable-512.png: sin esquinas y con más margen (zona segura de los íconos enmascarables).
// - badge-96.png: la silueta en blanco, para la barra de notificaciones del recordatorio web.
// - xibao-192.png: la cara sobre un círculo claro, ícono del recordatorio web.
// Android (android/app/src/main/res/):
// - mipmap-*/ic_launcher_foreground.png: la cara del ícono adaptable (el fondo es @color/ic_launcher_background).
//   También se usa en la pantalla de inicio.
// - mipmap-*/ic_launcher.png e ic_launcher_round.png: íconos para Android 7, que no usa los adaptables.
// - drawable/ic_launcher_monochrome.xml: la silueta para los íconos temáticos (Android 13 o superior).
// - drawable/ic_stat_danzi.xml: la silueta para la barra de notificaciones.
// - drawable-nodpi/xibao_aviso.png: la cara sobre un círculo claro, imagen grande del recordatorio.
//
// Uso: npm run icons (necesita Playwright con Chromium). Vuelve a ejecutarlo si cambias el dibujo de Xi Bao.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';

const RED = '#C8372D'; // theme_color de la app y @color/ic_launcher_background
const DISC = '#FCE9E6'; // círculo claro de los recordatorios: deja ver las orejas negras en la barra oscura
const RES = 'android/app/src/main/res';

// Encuadres de la cara (viewBox). El centro de la cabeza con orejas es (60, 42.5).
const FRAME = {
  tile: '14 0 92 92', // cuadrado redondeado: la cara llena el ícono
  maskable: '1.5 -16 117 117', // la cabeza cabe en el círculo central del 80 % (íconos enmascarables y redondos)
  adaptive: '-10 -27.5 140 140', // cabe en los 72 de 108 dp que siempre se ven del ícono adaptable
  disc: '16 4 88 88', // dentro del círculo claro de los recordatorios
};

let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {
  console.error('Este script necesita Playwright con Chromium.');
  process.exit(1);
}

// La cara se dibuja con el mismo componente de la app (React en Node).
const vite = await createServer({
  configFile: false,
  plugins: [react()],
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true, include: [] },
});
let face;
try {
  const { XiBao } = await vite.ssrLoadModule('/src/components/XiBao.tsx');
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  face = renderToStaticMarkup(createElement(XiBao, { mood: 'listo', face: true, size: 100 }));
} finally {
  await vite.close();
}

const browser = await chromium.launch();
const page = await browser.newPage({ colorScheme: 'light', reducedMotion: 'reduce' });

// Colores resueltos (sin clases ni variables CSS), para que el SVG funcione suelto.
await page.setContent(`<!doctype html><html><head><style>${fs.readFileSync('src/styles.css', 'utf8')}</style></head><body>${face}</body></html>`);
const flatFace = await page.evaluate(() => {
  const svg = document.querySelector('svg');
  for (const el of svg.querySelectorAll('*')) {
    if (el.tagName !== 'g') {
      const cs = getComputedStyle(el);
      for (const p of ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'opacity']) el.setAttribute(p, cs.getPropertyValue(p));
    }
    el.removeAttribute('class');
  }
  for (const a of ['class', 'width', 'height', 'aria-hidden', 'focusable']) svg.removeAttribute(a);
  return svg.outerHTML;
});

/** La cara con un encuadre, ocupando todo el lienzo de 1024. */
const framed = (frame) => flatFace.replace(/viewBox="[^"]*"/, `viewBox="${frame}"`).replace('<svg', '<svg x="0" y="0" width="1024" height="1024"');
const svgDoc = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${inner}</svg>`;

const DESIGNS = {
  tile: svgDoc(`<rect width="1024" height="1024" rx="224" fill="${RED}"/>${framed(FRAME.tile)}`),
  round: svgDoc(`<circle cx="512" cy="512" r="512" fill="${RED}"/>${framed(FRAME.maskable)}`),
  maskable: svgDoc(`<rect width="1024" height="1024" fill="${RED}"/>${framed(FRAME.maskable)}`),
  foreground: svgDoc(framed(FRAME.adaptive)),
  disc: svgDoc(`<circle cx="512" cy="512" r="512" fill="${DISC}"/><g transform="translate(72 72) scale(0.86)">${framed(FRAME.disc)}</g>`),
};

// --- Silueta (una sola tinta), con la geometría de XiBao.tsx ---
const n = (x) => +x.toFixed(3);
const circle = (cx, cy, r) => `M${n(cx - r)} ${cy}A${r} ${r} 0 1 0 ${n(cx + r)} ${cy}A${r} ${r} 0 1 0 ${n(cx - r)} ${cy}Z`;
function ellipse(cx, cy, rx, ry, rot = 0) {
  const a = (rot * Math.PI) / 180;
  const [dx, dy] = [rx * Math.cos(a), rx * Math.sin(a)];
  return `M${n(cx - dx)} ${n(cy - dy)}A${rx} ${ry} ${rot} 1 0 ${n(cx + dx)} ${n(cy + dy)}A${rx} ${ry} ${rot} 1 0 ${n(cx - dx)} ${n(cy - dy)}Z`;
}
const SIL = {
  ears: circle(33, 19, 11) + circle(87, 19, 11),
  // Cabeza con las manchas de los ojos y la nariz como huecos.
  head: circle(60, 44, 33) + ellipse(46, 46, 9.5, 12, 28) + ellipse(74, 46, 9.5, 12, -28) + ellipse(60, 56, 4.2, 3),
  eyes: circle(48, 44.5, 3.4) + circle(72, 44.5, 3.4),
};
const silhouetteSvg = svgDoc(
  `<svg x="0" y="0" width="1024" height="1024" viewBox="${FRAME.disc}"><path fill="#fff" d="${SIL.ears}"/><path fill="#fff" fill-rule="evenodd" d="${SIL.head}"/><path fill="#fff" d="${SIL.eyes}"/></svg>`,
);
function vectorDrawable(dp, frame, note) {
  const [x, y, size] = frame.split(' ').map(Number);
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- ${note} Generado por scripts/icons.mjs a partir de la geometría de Xi Bao. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="${dp}dp"
    android:height="${dp}dp"
    android:viewportWidth="${size}"
    android:viewportHeight="${size}">
    <group android:translateX="${-x}" android:translateY="${-y}">
        <path android:fillColor="#FFFFFF" android:pathData="${SIL.ears}" />
        <path android:fillColor="#FFFFFF" android:fillType="evenOdd" android:pathData="${SIL.head}" />
        <path android:fillColor="#FFFFFF" android:pathData="${SIL.eyes}" />
    </group>
</vector>
`;
}

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  console.log('Escrito', file);
}

async function png(svg, file, size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.locator('svg').first().screenshot({ path: file, omitBackground: true });
  console.log('Dibujado', file);
}

// Web
write('public/icon.svg', DESIGNS.tile + '\n');
await png(DESIGNS.tile, 'public/icon-192.png', 192);
await png(DESIGNS.tile, 'public/icon-512.png', 512);
await png(DESIGNS.maskable, 'public/icon-maskable-512.png', 512);
await png(silhouetteSvg, 'public/badge-96.png', 96);
await png(DESIGNS.disc, 'public/xibao-192.png', 192);

// Android
const LEGACY = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [density, size] of Object.entries(LEGACY)) {
  await png(DESIGNS.tile, `${RES}/mipmap-${density}/ic_launcher.png`, size);
  await png(DESIGNS.round, `${RES}/mipmap-${density}/ic_launcher_round.png`, size);
  await png(DESIGNS.foreground, `${RES}/mipmap-${density}/ic_launcher_foreground.png`, (size * 108) / 48);
}
await png(DESIGNS.disc, `${RES}/drawable-nodpi/xibao_aviso.png`, 256);
write(`${RES}/drawable/ic_launcher_monochrome.xml`, vectorDrawable(108, FRAME.adaptive, 'Silueta de Xi Bao para los íconos temáticos.'));
write(`${RES}/drawable/ic_stat_danzi.xml`, vectorDrawable(24, FRAME.disc, 'Silueta de Xi Bao para la barra de notificaciones.'));

await browser.close();
