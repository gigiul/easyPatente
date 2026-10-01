// Variante WEB — microfono via AudioWorklet (PCM16 16kHz mono, ~1 frame/100ms)
// e coda di riproduzione PCM16 24kHz con stop immediato su barge-in.
// Il worklet è fornito come Blob URL (Metro non serve .js separati).

import type { LiveAudioIO } from './liveAudio';

const TARGET_RATE = 16000;   // ingresso Gemini (realtimeInput audio/pcm;rate=16000)
const FRAME_SAMPLES = 1600;  // 100ms @ 16kHz
const OUT_RATE = 24000;      // uscita Gemini

export function isVoiceSupported(): boolean {
  return true;
}

const WORKLET_CODE = `
class PCMCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.out = [];
    this.ratio = sampleRate / ${TARGET_RATE};
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length) {
      let i = 0;
      while (i < channel.length) {
        const end = Math.min(channel.length, i + this.ratio);
        let sum = 0, n = 0;
        for (let j = Math.floor(i); j < end; j++) { sum += channel[j]; n++; }
        if (n > 0) this.out.push(sum / n);
        i += this.ratio;
      }
      while (this.out.length >= ${FRAME_SAMPLES}) {
        const frame = new Float32Array(this.out.splice(0, ${FRAME_SAMPLES}));
        this.port.postMessage(frame, [frame.buffer]);
      }
    }
    return true;
  }
}
registerProcessor('pcm-capture', PCMCaptureProcessor);
`;

function f32ToPcm16Base64(samples: Float32Array): string {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  const bytes = new Uint8Array(pcm.buffer);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as number[]);
  }
  return btoa(binary);
}

function base64ToPcm16(data: string): Int16Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

export function createLiveAudio(): LiveAudioIO {
  let inCtx: AudioContext | null = null;
  let inStream: MediaStream | null = null;
  let inNode: AudioWorkletNode | null = null;
  let workletUrl: string | null = null;

  let outCtx: AudioContext | null = null;
  const outQueue: AudioBuffer[] = [];
  let outCurrent: AudioBufferSourceNode | null = null;

  const ensureOutCtx = (): AudioContext => {
    if (!outCtx || outCtx.state === 'closed') {
      try {
        outCtx = new AudioContext({ sampleRate: OUT_RATE });
      } catch {
        outCtx = new AudioContext();
      }
    }
    if (outCtx.state === 'suspended') void outCtx.resume();
    return outCtx;
  };

  const drainOutput = () => {
    if (outCurrent || outQueue.length === 0 || !outCtx) return;
    const buf = outQueue.shift()!;
    const src = outCtx.createBufferSource();
    src.buffer = buf;
    src.connect(outCtx.destination);
    outCurrent = src;
    src.onended = () => {
      outCurrent = null;
      drainOutput();
    };
    src.start();
  };

  return {
    async startInput(onFrame) {
      if (inNode) return;
      inStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      inCtx = new AudioContext();
      if (inCtx.state === 'suspended') await inCtx.resume();
      if (!workletUrl) {
        workletUrl = URL.createObjectURL(new Blob([WORKLET_CODE], { type: 'application/javascript' }));
      }
      await inCtx.audioWorklet.addModule(workletUrl);
      const source = inCtx.createMediaStreamSource(inStream);
      inNode = new AudioWorkletNode(inCtx, 'pcm-capture');
      inNode.port.onmessage = (e: MessageEvent) => {
        const samples = e.data instanceof Float32Array ? e.data : new Float32Array(e.data);
        if (samples.length === FRAME_SAMPLES) onFrame(f32ToPcm16Base64(samples));
      };
      source.connect(inNode);
      // nessuna connessione a destination: niente feedback dell'output
    },

    stopInput() {
      try { inNode?.disconnect(); } catch { /* ignore */ }
      inNode = null;
      inStream?.getTracks().forEach((t) => t.stop());
      inStream = null;
      if (inCtx && inCtx.state !== 'closed') void inCtx.close();
      inCtx = null;
    },

    playPcm24kBase64(data: string) {
      try {
        const ctx = ensureOutCtx();
        const s16 = base64ToPcm16(data);
        const f32 = new Float32Array(s16.length);
        for (let i = 0; i < s16.length; i++) f32[i] = s16[i] / 32768;
        const buf = ctx.createBuffer(1, f32.length, OUT_RATE);
        buf.copyToChannel(f32, 0);
        outQueue.push(buf);
        drainOutput();
      } catch (err) {
        console.warn('[liveAudio] playback error:', err);
      }
    },

    stopOutput() {
      outQueue.length = 0;
      if (outCurrent) {
        outCurrent.onended = null;
        try { outCurrent.stop(); } catch { /* already stopped */ }
        outCurrent = null;
      }
    },

    dispose() {
      this.stopOutput();
      this.stopInput();
      if (workletUrl) {
        URL.revokeObjectURL(workletUrl);
        workletUrl = null;
      }
      if (outCtx && outCtx.state !== 'closed') void outCtx.close();
      outCtx = null;
    },
  };
}
