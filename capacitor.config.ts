// Configuración de la APK de Android (Capacitor). La app web de dist/ va dentro de la APK.
//
// No cambies appId ni el origen de la página (Capacitor sirve la app desde https://localhost):
// el progreso de la APK vive en ese origen y, si cambia, la app arranca sin progreso.
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.github.alejo452.danzi',
  appName: 'Danzi',
  webDir: 'dist',
  plugins: {
    // index.html usa viewport-fit=cover: la página respeta las barras del sistema con env(safe-area-inset-*).
    SystemBars: { initialViewportFitValueHint: 'cover' },
    LocalNotifications: { smallIcon: 'ic_stat_danzi', iconColor: '#C8372D' },
  },
};

export default config;
