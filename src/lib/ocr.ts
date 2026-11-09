// Leer el texto de una foto en la APK: qué decir cuando algo falla. Funciones puras; la cámara y la lectura están en
// src/native/ocr.ts, y los códigos salen del complemento propio
// (android/app/src/main/java/io/github/alejo452/danzi/ChineseOcrPlugin.java).

/** De dónde sale la foto. */
export type PhotoSource = 'camara' | 'galeria';

/** El código de un error de Capacitor, o '' si no trae. */
export function errorCode(e: unknown): string {
  const code = typeof e === 'object' && e !== null ? (e as { code?: unknown }).code : undefined;
  return typeof code === 'string' ? code : '';
}

/** Qué decir cuando no se pudo tomar, elegir o leer la foto: qué pasó y qué hacer. Nunca el mensaje técnico. */
export function photoErrorMessage(e: unknown, source: PhotoSource): string {
  switch (errorCode(e)) {
    case 'SIN_CAMARA':
      return 'Este celular no tiene una app de cámara. Elige una foto de la galería.';
    case 'CAMARA':
      return 'No se pudo abrir la cámara. Vuelve a intentarlo.';
    case 'GALERIA':
      return 'No se pudo abrir la galería. Vuelve a intentarlo.';
    case 'SIN_SERVICIOS':
      return 'Para leer fotos, Danzi necesita Google Play Services y este celular no lo tiene. Copia el texto con otra app y pégalo aquí.';
    case 'DESCARGANDO':
      return 'El lector de chino se está descargando (solo pasa la primera vez y necesita internet). Vuelve a intentarlo en un minuto.';
    case 'FOTO':
      return source === 'camara' ? 'No se pudo abrir la foto. Vuelve a tomarla.' : 'No se pudo abrir la foto. Prueba con otra.';
    case 'LECTURA':
      return 'No se pudo leer el texto de la foto. Vuelve a intentarlo.';
  }
  return source === 'camara' ? 'No se pudo tomar la foto. Vuelve a intentarlo.' : 'No se pudo abrir la foto. Prueba con otra.';
}
