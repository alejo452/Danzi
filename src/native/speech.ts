// Voz en la APK: la vista web de Android no trae la voz de Chrome, así que la lectura en voz alta
// y el reconocimiento de voz usan los motores de Android. Solo se carga dentro de la APK;
// src/lib/speech.ts decide qué usar.
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { TextToSpeech } from '@capacitor-community/text-to-speech';

const LANG = 'zh-CN';

export async function speak(text: string, rate: number): Promise<void> {
  // queueStrategy 0: lo nuevo interrumpe lo que se esté leyendo.
  await TextToSpeech.speak({ text, lang: LANG, rate, pitch: 1, volume: 1, queueStrategy: 0 });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * true si el celular no tiene la voz en chino. Justo al abrir la app el motor de voz puede no estar listo
 * y responder que no la tiene: por eso se pregunta varias veces y solo se avisa si el motor ya respondió
 * con su lista de idiomas.
 */
export async function chineseVoiceMissing(): Promise<boolean> {
  for (let i = 0; i < 3; i++) {
    try {
      if ((await TextToSpeech.isLanguageSupported({ lang: LANG })).supported) return false;
    } catch {
      /* el motor todavía no está listo */
    }
    await wait(1000);
  }
  try {
    return (await TextToSpeech.getSupportedLanguages()).languages.length > 0;
  } catch {
    return false;
  }
}

/** Abre la pantalla de Android para descargar las voces del motor de texto a voz. */
export async function installVoice(): Promise<void> {
  await TextToSpeech.openInstall();
}

class VoiceError extends Error {}

const NO_SPEECH = 'No te escuché. Toca el micrófono y habla cerca del teléfono.';
const NETWORK = 'El reconocimiento de voz necesita internet. Revisa tu conexión.';
const PERMISSION = 'Danzi no tiene permiso para usar el micrófono. Actívalo en los ajustes del celular (Apps › Danzi › Permisos) y vuelve a intentarlo.';
const UNAVAILABLE = 'Este celular no tiene reconocimiento de voz. Instala o actualiza la app de Google, o usa el dictado del teclado.';

// Mensajes en inglés del complemento (SpeechRecognizer de Android) → mensajes para Diego.
const MESSAGES: Record<string, string> = {
  'No speech input': NO_SPEECH,
  'No match': 'No entendí la frase. Toca el micrófono y repítela despacio, cerca del teléfono.',
  'Audio recording error': 'No se pudo usar el micrófono. Cierra las otras apps que lo estén usando y vuelve a intentarlo.',
  'Network error': NETWORK,
  'Network timeout': NETWORK,
  'error from server': NETWORK,
  'RecognitionService busy': 'El reconocimiento de voz está ocupado. Espera un momento y vuelve a intentarlo.',
  'Insufficient permissions': PERMISSION,
  'Missing permission': PERMISSION,
  [`Speech recognition service is not available.`]: UNAVAILABLE,
};

function messageFor(e: unknown): string {
  if (e instanceof VoiceError) return e.message;
  const m = (e as { message?: string } | null)?.message ?? '';
  return MESSAGES[m] ?? 'No se pudo usar el reconocimiento de voz. Vuelve a intentarlo.';
}

/** Escucha una frase en chino y devuelve lo que entendió. Rechaza con un mensaje en español (vacío si se canceló). */
export function listenOnce(): { promise: Promise<string>; stop: () => void } {
  let cancelled = false;
  let cancel: (e: Error) => void = () => {};
  const promise = new Promise<string>((resolve, reject) => {
    cancel = reject;
    (async () => {
      if (!(await SpeechRecognition.available()).available) throw new VoiceError(UNAVAILABLE);
      let { speechRecognition } = await SpeechRecognition.checkPermissions();
      if (speechRecognition !== 'granted') ({ speechRecognition } = await SpeechRecognition.requestPermissions());
      if (speechRecognition !== 'granted') throw new VoiceError(PERMISSION);
      if (cancelled) return;
      const result = (await SpeechRecognition.start({ language: LANG, maxResults: 1, partialResults: false, popup: false })) as {
        matches?: string[];
        status?: string;
        message?: string;
      };
      if (result.status === 'error') throw new Error(result.message);
      resolve(result.matches?.[0] ?? '');
    })().catch((e) => {
      if (!cancelled) reject(new Error(messageFor(e)));
    });
  });
  return {
    promise,
    stop: () => {
      cancelled = true;
      // El complemento nunca responde a stop(): no se espera.
      SpeechRecognition.stop().catch(() => undefined);
      cancel(new Error(''));
    },
  };
}
