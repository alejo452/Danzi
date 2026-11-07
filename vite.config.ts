import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// En GitHub Pages la app vive en /<nombre-del-repo>/. El workflow define BASE_PATH.
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  base,
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
