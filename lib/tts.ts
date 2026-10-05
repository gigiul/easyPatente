import { AppAlert } from '@/lib/alert';
import i18n from '@/i18n';
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';

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

/**
 * Legge l'elenco voci corrente con timeout: su web la lista puo' arrivare in
 * ritardo o non arrivare mai, e non va bloccata la lettura per questo.
 */
async function currentVoices(): Promise<Speech.Voice[]> {
  try {
    return await Promise.race([
      Speech.getAvailableVoicesAsync(),
      new Promise<Speech.Voice[]>((resolve) => setTimeout(() => resolve([]), VOICES_TIMEOUT_MS)),
    ]);
  } catch (error) {
    console.warn('[tts] impossibile leggere le voci disponibili:', error);
    return [] as Speech.Voice[];
  }
}

const warnedLocales = new Set<string>();

function hintKey(): string {
  if (Platform.OS === 'ios') return 'tts.hintIOS';
  if (Platform.OS === 'android') return 'tts.hintAndroid';
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'tts.hintIOS';
  if (/Android/i.test(userAgent)) return 'tts.hintAndroid';
  return 'tts.hintGeneric';
}

/**
 * Avvisa l'utente che manca la voce per la lingua richiesta (una sola volta
 * per locale, altrimenti il popup spammerebbe ad ogni lettura).
 */
function warnMissingVoice(locale: string): void {
  if (warnedLocales.has(locale)) return;
  warnedLocales.add(locale);

  const language = i18n.t(`user.language.${locale.split('-')[0]}`);
  console.warn(`[tts] nessuna voce installata per "${locale}": la lettura usera' la voce di sistema`);
  AppAlert.alert(
    i18n.t('tts.missingVoiceTitle'),
    `${i18n.t('tts.missingVoice', { language })} ${i18n.t(hintKey(), { language })}`
  );
}

/**
 * Sceglie la voce per la lingua richiesta su un elenco APPENA letto.
 *
 * Restituisce undefined quando la voce non e' presente: passare a expo-speech
 * un identificativo assente lo fa infatti cadere sulla PRIMA voce della lista
 * (voce di sistema, qualsiasi lingua) senza errore alcuno — in pratica legge
 * tutto con la voce predefinita, che su iPhone e' Alice (inglese).
 */
function selectVoice(voices: Speech.Voice[], langCode: string): string | undefined {
  if (!voices.length) return undefined;

  const locale = resolveTtsLocale(langCode);
  const base = locale.split('-')[0].toLowerCase();
  const normalized = locale.toLowerCase();

  const exact = voices.filter((voice) => voice.language?.toLowerCase() === normalized);
  const byLanguage = voices.filter(
    (voice) => voice.language?.toLowerCase().split('-')[0] === base
  );
  const candidates = exact.length ? exact : byLanguage;

  if (!candidates.length) {
    warnMissingVoice(locale);
    return undefined;
  }

  const chosen =
    candidates.find((voice) => voice.quality === Speech.VoiceQuality.Enhanced) || candidates[0];
  return chosen.identifier;
}

async function speakNow(text: string, langCode: string, current: number): Promise<void> {
  if (!text) return;

  const language = resolveTtsLocale(langCode);
  // Elenco voci fresco a ogni lettura: non si puo' usare una lista in cache,
  // perche' l'identificativo deve esistere nel momento esatto in cui
  // expo-speech va a cercarlo (su web la lista puo' essere rigenerata).
  const voice = selectVoice(await currentVoices(), langCode);

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
