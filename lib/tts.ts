import * as Speech from 'expo-speech';

/**
 * Locale TTS per codice lingua, allineato al seed di `public.languages`.
 * Usato al posto del lookup sullo store (che contiene solo le lingue attive
 * e che all'avvio e' ancora vuoto).
 */
const TTS_LOCALES: Record<string, string> = {
  it: 'it-IT',
  es: 'es-MX',
};

const VOICES_TIMEOUT_MS = 2000;

export function resolveTtsLocale(langCode: string): string {
  return TTS_LOCALES[langCode] || langCode;
}

let voicesPromise: Promise<Speech.Voice[]> | null = null;

function loadVoices(): Promise<Speech.Voice[]> {
  if (!voicesPromise) {
    voicesPromise = Promise.race([
      Speech.getAvailableVoicesAsync(),
      new Promise<Speech.Voice[]>((resolve) => setTimeout(() => resolve([]), VOICES_TIMEOUT_MS)),
    ])
      .then((voices) => {
        if (!voices.length) voicesPromise = null;
        return voices;
      })
      .catch((error) => {
        console.warn('[tts] impossibile leggere le voci disponibili:', error);
        voicesPromise = null;
        return [] as Speech.Voice[];
      });
  }
  return voicesPromise;
}

const warnedLocales = new Set<string>();

/**
 * Sceglie esplicitamente una voce per la lingua richiesta, cosi' la piattaforma
 * non cade sulla voce predefinita di sistema quando il locale non corrisponde.
 */
export async function pickVoice(langCode: string): Promise<string | undefined> {
  const locale = resolveTtsLocale(langCode);
  const base = locale.split('-')[0].toLowerCase();
  const voices = await loadVoices();
  if (!voices.length) return undefined;

  const normalized = locale.toLowerCase();
  const exact = voices.filter((voice) => voice.language?.toLowerCase() === normalized);
  const byLanguage = voices.filter(
    (voice) => voice.language?.toLowerCase().split('-')[0] === base
  );
  const candidates = exact.length ? exact : byLanguage;

  if (!candidates.length) {
    if (!warnedLocales.has(normalized)) {
      warnedLocales.add(normalized);
      console.warn(`[tts] nessuna voce installata per "${locale}": la lettura usera' la voce di sistema`);
    }
    return undefined;
  }

  const enhanced = candidates.find((voice) => voice.quality === Speech.VoiceQuality.Enhanced);
  return (enhanced || candidates[0]).identifier;
}

async function speakNow(text: string, langCode: string, current: number): Promise<void> {
  if (!text) return;

  const language = resolveTtsLocale(langCode);
  const voice = await pickVoice(langCode);

  // Una stop()/lettura successiva e' arrivata mentre aspettavamo le voci
  if (current !== generation) return;

  try {
    await Speech.stop();
    if (current !== generation) return;
    await Speech.speak(text, {
      language,
      voice,
      pitch: 1.0,
      rate: 0.9,
      volume: 1.0,
    });
  } catch (error) {
    console.error('[tts] errore nella lettura del testo:', error);
  }
}

/** Serializza le letture e annulla quelle pendenti. */
let queue: Promise<void> = Promise.resolve();
let generation = 0;

export function speak(text: string, langCode: string): Promise<void> {
  const current = ++generation;
  queue = queue
    .then(() => speakNow(text, langCode, current))
    .catch((error) => console.error('[tts] lettura non riuscita:', error));
  return queue;
}

export function stop(): void {
  generation += 1;
  void Speech.stop();
}
