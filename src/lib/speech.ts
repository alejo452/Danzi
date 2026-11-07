// Voz: lectura en voz alta (síntesis) y reconocimiento de voz en chino.

let voice: SpeechSynthesisVoice | null = null;
let voicesChecked = false;

export const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

function pickVoice() {
  if (!canSpeak) return;
  const voices = speechSynthesis.getVoices();
  voice =
    voices.find((v) => /^zh[-_](CN|Hans)/i.test(v.lang)) ?? voices.find((v) => /^zh/i.test(v.lang)) ?? null;
  if (voices.length) voicesChecked = true;
}

if (canSpeak) {
  pickVoice();
  speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
}

/** true cuando el dispositivo ya informó sus voces y ninguna es china. */
export function missingChineseVoice(): boolean {
  pickVoice();
  return canSpeak && voicesChecked && !voice;
}

export function speak(text: string, rate = 0.85): void {
  if (!canSpeak) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    if (voice) u.voice = voice;
    u.rate = rate;
    speechSynthesis.speak(u);
  } catch {
    /* sin voz disponible */
  }
}

// --- Reconocimiento de voz (Chrome en Android y computador, Safari en iPhone) ---

type RecognitionCtor = new () => {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
};

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const canListen = recognitionCtor() !== null;

const ERRORS: Record<string, string> = {
  'not-allowed': 'No hay permiso para usar el micrófono. Actívalo en los ajustes del navegador para este sitio.',
  'service-not-allowed': 'Este navegador no permite el reconocimiento de voz aquí. Usa el dictado del teclado.',
  'no-speech': 'No te escuché. Toca el micrófono y habla cerca del teléfono.',
  'audio-capture': 'No se encontró un micrófono.',
  network: 'El reconocimiento de voz necesita internet. Revisa tu conexión.',
  'language-not-supported': 'Tu navegador no reconoce chino. Usa el dictado del teclado.',
};

/** Escucha una frase en chino y devuelve lo que entendió. Rechaza con un mensaje en español. */
export function listenOnce(): { promise: Promise<string>; stop: () => void } {
  const Ctor = recognitionCtor();
  if (!Ctor) return { promise: Promise.reject(new Error('Este navegador no tiene reconocimiento de voz.')), stop: () => {} };
  const rec = new Ctor();
  rec.lang = 'zh-CN';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.continuous = false;
  const promise = new Promise<string>((resolve, reject) => {
    let done = false;
    rec.onresult = (e) => {
      done = true;
      resolve(e.results[0]?.[0]?.transcript ?? '');
    };
    rec.onerror = (e) => {
      if (done) return;
      done = true;
      reject(new Error(ERRORS[e.error] ?? 'No se pudo usar el reconocimiento de voz.'));
    };
    rec.onend = () => {
      if (!done) {
        done = true;
        reject(new Error(ERRORS['no-speech']));
      }
    };
    rec.start();
  });
  return { promise, stop: () => rec.abort() };
}
