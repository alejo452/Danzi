// Guardar archivos en la APK. La vista web de Android no descarga archivos por su cuenta, así que
// «Descargar» (Ajustes › Tu progreso) abre el diálogo «Guardar en…» de Android con un complemento propio
// (android/app/src/main/java/io/github/alejo452/danzi/SaveFilePlugin.java).
import { registerPlugin } from '@capacitor/core';

type SaveFilePlugin = {
  save(options: { name: string; data: string; mimeType?: string }): Promise<{ saved: boolean }>;
};

const SaveFile = registerPlugin<SaveFilePlugin>('SaveFile');

/** Guarda el texto donde elija la persona. Devuelve false si cerró el diálogo sin guardar. */
export async function saveTextFile(name: string, data: string, mimeType = 'application/json'): Promise<boolean> {
  return (await SaveFile.save({ name, data, mimeType })).saved;
}
