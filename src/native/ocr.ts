// Leer el texto en chino de una foto, en la APK (Palabras › Leer un texto). Un complemento propio
// (android/app/src/main/java/io/github/alejo452/danzi/ChineseOcrPlugin.java) abre la cámara o la galería del celular y
// lee la foto con ML Kit de Google, en el mismo teléfono: la foto no sale de ahí. Los mensajes de error están en
// src/lib/ocr.ts.
import { registerPlugin } from '@capacitor/core';
import { photoErrorMessage, type PhotoContext, type PhotoSource } from '../lib/ocr';

type ChineseOcrPlugin = {
  prepare(): Promise<{ ready: boolean }>;
  /** Sin `uri` si la persona cerró la cámara o la galería sin elegir. */
  pickPhoto(options: { source: PhotoSource }): Promise<{ uri?: string }>;
  recognize(options: { uri: string }): Promise<{ text: string }>;
};

const ChineseOcr = registerPlugin<ChineseOcrPlugin>('ChineseOcr');

/**
 * Pide que el celular descargue el lector de chino si todavía no lo tiene, para que la primera foto no tenga que
 * esperar. Nunca falla: si no se puede, lo dirá la lectura.
 */
export async function prepareReader(): Promise<boolean> {
  try {
    return (await ChineseOcr.prepare()).ready;
  } catch {
    return false;
  }
}

/**
 * Toma una foto (o la elige de la galería) y lee su texto. null si la persona cerró la cámara o la galería sin elegir;
 * `error` trae el mensaje para mostrar, según la pantalla (`context`). `onReading` avisa cuando ya hay foto y empieza la
 * lectura. Nunca falla.
 */
export async function readPhoto(
  source: PhotoSource,
  onReading: () => void,
  context: PhotoContext = 'leer',
): Promise<{ text: string } | { error: string } | null> {
  try {
    const { uri } = await ChineseOcr.pickPhoto({ source });
    if (!uri) return null;
    onReading();
    return { text: (await ChineseOcr.recognize({ uri })).text };
  } catch (e) {
    return { error: photoErrorMessage(e, source, context) };
  }
}
