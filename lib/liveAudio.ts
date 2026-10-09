// Variante NATIVA — microfono PCM16 16kHz mono via @edkimmel/expo-audio-stream
// (eventi base64 ogni 100ms) e playback streaming jitter-buffered con Pipeline
// (PCM16 24kHz, barge-in immediato via invalidateTurn). Equivalente nativo di
// liveAudio.web.ts: stesso contratto LiveAudioIO, stessi rate Gemini (D8).

import {
  ExpoPlayAudioStream,
  Pipeline,
  type Subscription,
} from '@edkimmel/expo-audio-stream';

const TARGET_RATE = 16000; // ingresso Gemini (realtimeInput audio/pcm;rate=16000)
const OUT_RATE = 24000; // uscita Gemini

export function isVoiceSupported(): boolean {
  return true;
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
  let micSubscription: Subscription | null = null;
  let micActive = false;
  let disposed = false;
  let pipelineReady = false;
  let pipelineConnecting: Promise<void> | null = null;
  let errorSub: { remove(): void } | null = null;
  // Stato turno output: la prima spinta apre un turno, barge-in lo invalida.
  let turnOpen = false;
  let turnSeq = 0;
  // Frame di risposta arrivati prima che la pipeline sia collegata.
  const pendingPush: string[] = [];

  const ensurePipeline = (): Promise<void> => {
    if (pipelineReady) return Promise.resolve();
    if (!pipelineConnecting) {
      pipelineConnecting = Pipeline.connect({
        sampleRate: OUT_RATE,
        channelCount: 1,
        targetBufferMs: 80,
        playbackMode: 'voiceProcessing',
      })
        .then(() => {
          pipelineConnecting = null;
          if (disposed) {
            void Pipeline.disconnect().catch(() => {});
            return;
          }
          pipelineReady = true;
          errorSub = Pipeline.onError((err) => console.warn('[liveAudio] pipeline error:', err));
          while (pendingPush.length > 0 && pipelineReady) pushNow(pendingPush.shift()!);
        })
        .catch((err) => {
          pipelineConnecting = null;
          pendingPush.length = 0;
          console.warn('[liveAudio] pipeline connect error:', err);
          throw err;
        });
    }
    return pipelineConnecting;
  };

  const pushNow = (data: string) => {
    if (!turnOpen) {
      turnSeq += 1;
      turnOpen = true;
      Pipeline.pushAudioSync({ audio: data, turnId: `t${turnSeq}`, isFirstChunk: true });
    } else {
      Pipeline.pushAudioSync({ audio: data, turnId: `t${turnSeq}` });
    }
  };

  return {
    async startInput(onFrame) {
      if (micActive) return;
      // La pipeline di playback parte in parallelo: deve essere pronta prima
      // del primo modelTurn, non necessariamente qui.
      void ensurePipeline().catch(() => {});
      const perm = await ExpoPlayAudioStream.requestPermissionsAsync();
      if (!perm.granted) throw new Error('VOICE_MIC_DENIED');
      const { subscription } = await ExpoPlayAudioStream.startMicrophone({
        sampleRate: TARGET_RATE,
        channels: 1,
        encoding: 'pcm_16bit',
        interval: 100,
        onAudioStream: async (event) => {
          if (typeof event.data === 'string' && event.data.length > 0) onFrame(event.data);
        },
        onError: (event) => {
          console.warn('[liveAudio] mic error:', event.code, event.message, 'fatal:', event.isFatal);
        },
      });
      micSubscription = subscription ?? null;
      micActive = true;
    },

    stopInput() {
      if (!micActive) return;
      micActive = false;
      micSubscription?.remove();
      micSubscription = null;
      void ExpoPlayAudioStream.stopMicrophone().catch(() => {});
    },

    playPcm24kBase64(data: string) {
      if (disposed || !data) return;
      if (pipelineReady) {
        pushNow(data);
        return;
      }
      pendingPush.push(data);
      void ensurePipeline().catch(() => {});
    },

    stopOutput() {
      pendingPush.length = 0;
      if (turnOpen) {
        const turnId = `t${turnSeq}`;
        turnOpen = false;
        if (pipelineReady) void Pipeline.invalidateTurn({ turnId }).catch(() => {});
      }
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      this.stopOutput();
      this.stopInput();
      pendingPush.length = 0;
      turnOpen = false;
      errorSub?.remove();
      errorSub = null;
      if (pipelineReady || pipelineConnecting) {
        void Pipeline.disconnect().catch(() => {});
        pipelineReady = false;
        pipelineConnecting = null;
      }
    },
  };
}
