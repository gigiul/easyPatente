// Variante NATIVA (placeholder) — la chat vocale è web-first (D8, piano
// PLAN_VOICE_CHAT.md): l'audio PCM nativo arriva in una fase successiva
// (lib PCM streaming, vedi §Fase 3 del piano).

/** La chat vocale è web-first (D8): su nativo non c'è ancora audio PCM. */
export function isVoiceSupported(): boolean {
  return false;
}

export interface LiveAudioIO {
  /** Apre il microfono e streamma frame PCM16 16kHz mono (base64, ~100ms). */
  startInput(onFrame: (pcm16Base64: string) => void): Promise<void>;
  stopInput(): void;
  /** Accoda un frame audio di risposta (PCM16 24kHz mono base64). */
  playPcm24kBase64(data: string): void;
  /** Barge-in: ferma subito l'output in riproduzione e svuota la coda. */
  stopOutput(): void;
  dispose(): void;
}

export function createLiveAudio(): LiveAudioIO {
  const unsupported = () => {
    console.warn('[liveAudio] audio vocale non ancora supportato su nativo');
  };
  return {
    async startInput() {
      unsupported();
      throw new Error('VOICE_NATIVE_AUDIO_UNSUPPORTED');
    },
    stopInput: unsupported,
    playPcm24kBase64: unsupported,
    stopOutput: unsupported,
    dispose: unsupported,
  };
}
