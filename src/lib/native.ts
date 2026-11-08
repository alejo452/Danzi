// Si la app corre dentro de la APK de Android (Capacitor) y no en el navegador.
// Capacitor define window.Capacitor antes de que cargue la página, así que basta con mirarlo:
// la versión web no carga nada de Capacitor. El código propio de la APK está en src/native/
// y se importa solo cuando isNative es true.

type CapacitorGlobal = { isNativePlatform?: () => boolean };

export const isNative: boolean =
  typeof window !== 'undefined' && (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor?.isNativePlatform?.() === true;
