// Dibuja las imágenes de Xi Bao para los recordatorios, a partir de src/components/XiBao.tsx:
// - android/app/src/main/res/drawable-nodpi/xibao_aviso.png (256 px): la imagen grande del aviso en la APK.
// - public/xibao-192.png (192 px): el ícono del aviso en la versión web.
// La cara va sobre un círculo claro, para que las orejas negras se vean también en la barra oscura.
//
// Uso: node scripts/mascot-images.mjs (necesita Playwright con Chromium). Vuelve a ejecutarlo si cambias el dibujo.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';

const OUTPUTS = [
  { file: 'android/app/src/main/res/drawable-nodpi/xibao_aviso.png', size: 256 },
  { file: 'public/xibao-192.png', size: 192 },
];

let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {
  console.error('Este script necesita Playwright con Chromium.');
  process.exit(1);
}

// El componente se dibuja con React en Node, con el mismo código de la app.
const vite = await createServer({ configFile: false, plugins: [react()], server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
let svg;
try {
  const { XiBao } = await vite.ssrLoadModule('/src/components/XiBao.tsx');
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  svg = renderToStaticMarkup(createElement(XiBao, { mood: 'listo', face: true, size: 100 }));
} finally {
  await vite.close();
}

const css = fs.readFileSync('src/styles.css', 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage({ colorScheme: 'light', reducedMotion: 'reduce' });
for (const { file, size } of OUTPUTS) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * 0.86);
  await page.setContent(`<!doctype html><html><head><style>${css}
    html, body { background: transparent !important; margin: 0; }
    .disc { width: ${size}px; height: ${size}px; border-radius: 50%; background: #FCE9E6; display: grid; place-items: center; }
  </style></head><body><div class="disc">${svg.replace(/width="100" height="100"/, `width="${inner}" height="${inner}"`)}</div></body></html>`);
  fs.mkdirSync(file.replace(/\/[^/]+$/, ''), { recursive: true });
  await page.locator('.disc').screenshot({ path: file, omitBackground: true });
  console.log('Dibujado', file);
}
await browser.close();
