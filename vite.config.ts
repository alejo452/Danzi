import fs from 'node:fs';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// En GitHub Pages la app vive en /<nombre-del-repo>/. El workflow define BASE_PATH.
const base = process.env.BASE_PATH || '/';

// Número de versión de la parte web (android.yml lo define con el número de ejecución). La APK lo usa para
// saber si hay una versión más nueva (src/native/updates.ts). En las compilaciones locales vale 0.
const danziVersion = Number.parseInt(process.env.DANZI_VERSION ?? '', 10) || 0;
// En las versiones de prueba, el pull request del que salen (0 en las demás).
const danziPr = Number.parseInt(process.env.DANZI_PR ?? '', 10) || 0;
// Huella de la parte de Android de esta compilación (scripts/update-manifest.mjs --huella). «Danzi Pruebas»
// la guarda al abrir la versión que trae la APK, para saber qué versiones de prueba puede usar sin reinstalar.
const danziHuella = /^[0-9a-f]{64}$/.test(process.env.DANZI_HUELLA ?? '') ? process.env.DANZI_HUELLA : '';
// Proyecto de Supabase para la sincronización (supabase/config.json). La dirección y la llave publicable van dentro
// de la app a propósito: son públicas, y las reglas de la tabla (supabase/schema.sql) protegen el progreso de cada
// cuenta. DANZI_SUPABASE_URL y DANZI_SUPABASE_KEY las reemplazan (por ejemplo, para probar con un servidor simulado).
// Sin dirección, la app no muestra la sincronización.
const nubeArchivo = JSON.parse(fs.readFileSync('supabase/config.json', 'utf8')) as { url?: string; key?: string };
const nube = {
  url: (process.env.DANZI_SUPABASE_URL ?? nubeArchivo.url ?? '').replace(/\/+$/, ''),
  key: process.env.DANZI_SUPABASE_KEY ?? nubeArchivo.key ?? '',
};
if (nube.url && !/^https:\/\/[^/]+$/.test(nube.url)) throw new Error(`supabase/config.json: la dirección debe ser https://<proyecto>.supabase.co, no ${nube.url}`);

export default defineConfig({
  base,
  define: {
    __DANZI_VERSION__: JSON.stringify(danziVersion),
    __DANZI_PR__: JSON.stringify(danziPr),
    __DANZI_HUELLA__: JSON.stringify(danziHuella),
    __DANZI_NUBE__: JSON.stringify(nube.url && nube.key ? nube : { url: '', key: '' }),
  },
  build: {
    rollupOptions: {
      output: {
        // El código de la APK de Android (src/native y Capacitor) solo se importa de forma dinámica, así que
        // queda en archivos aparte. Se llaman native-*.js para que el service worker de la versión web
        // no los guarde (globIgnores). No usar manualChunks: arrastra módulos compartidos a esos archivos.
        chunkFileNames: (chunk) =>
          chunk.moduleIds.some((id) => /[\\/]src[\\/]native[\\/]|[\\/]node_modules[\\/]@(capacitor|capgo)[\\/-]/.test(id))
            ? 'assets/native-[name]-[hash].js'
            : 'assets/[name]-[hash].js',
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      // Service worker propio (src/sw.ts): además de guardar la app para usarla sin internet,
      // muestra el recordatorio diario.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Danzi',
        short_name: 'Danzi',
        description: 'Aprende chino con tarjetas, escritura y habla, según el HSK 3.0.',
        lang: 'es',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#F3F4F6',
        theme_color: '#C8372D',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        // Los trazos de todos los caracteres (strokes/*.json) se descargan al instalar la app,
        // para que la escritura funcione sin internet desde el primer día.
        globPatterns: ['**/*.{js,css,html,svg,png}', 'strokes/*.json'],
        globIgnores: ['**/node_modules/**/*', 'assets/native-*.js'],
        // Un solo archivo clásico, sin módulos: así lo cargan todos los navegadores.
        rollupFormat: 'iife',
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
