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
    // Actualización automática de la parte web (src/native/updates.ts). La app decide cuándo buscar y descarga de
    // Releases: el plugin no consulta los servidores de Capgo ni les manda estadísticas (URLs vacías).
    CapacitorUpdater: {
      autoUpdate: false,
      updateUrl: '',
      channelUrl: '',
      statsUrl: '',
      // Si una versión nueva no confirma en 15 segundos que arrancó, el plugin vuelve a la anterior.
      appReadyTimeout: 15000,
      // Al instalar una APK más nueva se usa la parte web que trae, no la descargada antes.
      resetWhenUpdate: true,
      // Al cambiar de versión se queda en la misma pestaña (#repasar, #ajustes…).
      keepUrlPathAfterReload: true,
    },
  },
};

export default config;
