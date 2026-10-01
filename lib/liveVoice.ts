// Session manager della chat vocale (client): handshake con la edge function
// `live` (auth via ?access_token), forwarding dei messaggi Live API, gestione
// stato in voice store, persistenza locale dei turni in chat store.
// Protocollo: doc/PLAN_VOICE_CHAT.md §Fase 2/3.

import { createLiveAudio, type LiveAudioIO } from '@/lib/liveAudio';
import { supabase } from '@/lib/supabase';
import { useChatStore } from '@/store/chat';
import { useVoiceStore, type VoiceErrorCode } from '@/store/voice';

const CLOSE_ERRORS: Record<number, VoiceErrorCode> = {
  4401: 'auth',
  4403: 'notEnabled',
  4429: 'rateLimit',
  4408: 'idle',
  // 4000 (session cap, VOICE_SESSION_MAX_SECONDS) NON è un errore: cade nel
  // ramo di riconnessione, così il limite di durata della sessione (145s su DEV
  // per il wall-clock free tier) viene superato con una nuova sessione fluida.
};

const AUTH_TIMEOUT_MS = 10000;
const MAX_RECONNECT_ATTEMPTS = 1;

let ws: WebSocket | null = null;
let audio: LiveAudioIO | null = null;
let questionId: string | null = null;
let langCode = 'it';
let intentionalClose = false;
let reconnectAttempts = 0;
let authTimer: ReturnType<typeof setTimeout> | null = null;
let micStarted = false;

function finalizeTurn() {
  const { userTranscript, assistantTranscript } = useVoiceStore.getState();
  if (userTranscript || assistantTranscript) {
    useChatStore.getState().addVoiceTurn(userTranscript, assistantTranscript);
  }
  useVoiceStore.getState().clearTurn();
}

function teardownAudio() {
  micStarted = false;
  if (audio) {
    try { audio.dispose(); } catch { /* ignore */ }
    audio = null;
  }
}

function endSession(error: VoiceErrorCode | null = null) {
  intentionalClose = true;
  if (authTimer) { clearTimeout(authTimer); authTimer = null; }
  finalizeTurn();
  teardownAudio();
  if (ws) {
    try { ws.close(1000, 'client_stop'); } catch { /* ignore */ }
    ws = null;
  }
  useVoiceStore.setState({ active: false, status: 'idle', userTranscript: '', assistantTranscript: '', error });
}

function send(obj: unknown) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

async function openSession() {
  const store = useVoiceStore.getState();
  store.setStatus('connecting');

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    endSession('auth');
    return;
  }

  const base = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const url = `${base.replace(/^http/, 'ws')}/functions/v1/live?access_token=${encodeURIComponent(session.access_token)}`;
  ws = new WebSocket(url);

  authTimer = setTimeout(() => {
    if (useVoiceStore.getState().status === 'connecting') endSession('connection');
  }, AUTH_TIMEOUT_MS);

  ws.onopen = () => {
    send({ hello: { lang_code: langCode, question_id: questionId, history: [] } });
  };

  ws.onmessage = (event) => handleMessage(event.data);

  ws.onclose = (event: CloseEvent) => {
    if (authTimer) { clearTimeout(authTimer); authTimer = null; }
    const wasIntentional = intentionalClose;
    ws = null;
    teardownAudio();

    if (wasIntentional) return; // endSession ha già gestito lo stato

    const mapped = CLOSE_ERRORS[event.code];
    if (mapped) {
      useVoiceStore.setState({ active: false, status: 'idle', error: mapped });
      return;
    }

    // Chiusura imprevista (es. 1011 upstream): un solo tentativo di riconnessione
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      void openSession();
    } else {
      useVoiceStore.setState({ active: false, status: 'idle', error: 'connection' });
    }
  };

  ws.onerror = () => {
    // onclose fa da cattura; qui evitiamo solo rumore
  };
}

function handleMessage(data: unknown) {
  const text =
    typeof data === 'string'
      ? data
      : data instanceof ArrayBuffer
        ? new TextDecoder().decode(data)
        : String(data);

  let msg: Record<string, any>;
  try {
    msg = JSON.parse(text);
  } catch {
    return;
  }

  const voice = useVoiceStore.getState();

  if (msg.proxyStatus) {
    const st = msg.proxyStatus;
    switch (st.type) {
      case 'auth_ok':
        if (authTimer) { clearTimeout(authTimer); authTimer = null; }
        reconnectAttempts = 0;
        if (typeof st.remaining === 'number') {
          useChatStore.getState().setRemainingRequests(st.remaining);
        }
        break;
      case 'auth_error':
        // arriva anche il close con lo stesso codice: imposta solo il codice
        if (st.status === 401) voice.setError('auth');
        else if (st.status === 403) voice.setError('notEnabled');
        else if (st.status === 429) voice.setError('rateLimit');
        break;
      case 'ready':
        voice.setStatus('listening');
        void startMic();
        break;
      case 'tool_latency':
        voice.setStatus('thinking');
        break;
      case 'rate':
        if (typeof st.remaining === 'number') {
          useChatStore.getState().setRemainingRequests(st.remaining);
        }
        break;
      case 'upstream_error':
        voice.setError('connection');
        break;
    }
    return;
  }

  if (msg.setupComplete) return;

  const sc = msg.serverContent;
  if (sc) {
    if (sc.inputTranscription?.text) {
      voice.appendUserTranscript(sc.inputTranscription.text);
      voice.setStatus('listening');
    }
    if (sc.outputTranscription?.text) {
      voice.appendAssistantTranscript(sc.outputTranscription.text);
      voice.setStatus('speaking');
    }
    if (sc.interrupted || sc.aborted) {
      // Barge-in: l'utente ha parlato sopra la risposta
      audio?.stopOutput();
      voice.setStatus('listening');
    }
    if (sc.turnComplete) {
      finalizeTurn();
      voice.setStatus('listening');
    }
    for (const part of sc.modelTurn?.parts ?? []) {
      if (part.inlineData?.mimeType?.startsWith('audio') && part.inlineData?.data) {
        audio?.playPcm24kBase64(part.inlineData.data);
        voice.setStatus('speaking');
      }
    }
  }
}

async function startMic() {
  if (micStarted) return;
  if (!audio) audio = createLiveAudio();
  try {
    await audio.startInput((frame) => send({
      realtimeInput: { audio: { data: frame, mimeType: 'audio/pcm;rate=16000' } },
    }));
    micStarted = true;
  } catch (err) {
    console.warn('[liveVoice] mic error:', err);
    const stopError: VoiceErrorCode = (err as Error)?.message === 'VOICE_NATIVE_AUDIO_UNSUPPORTED'
      ? 'connection'
      : 'micDenied';
    endSession(stopError);
  }
}

/** Apre la sessione vocale. Ritorna false se auth/mic falliscono subito. */
export async function startVoiceSession(
  opts: { questionId?: string | null; lang?: string } = {},
): Promise<boolean> {
  if (ws) stopVoiceSession();
  questionId = opts.questionId ?? useChatStore.getState().questionId;
  langCode = opts.lang ?? langCode;
  intentionalClose = false;
  reconnectAttempts = 0;
  useVoiceStore.setState({
    active: true,
    status: 'connecting',
    userTranscript: '',
    assistantTranscript: '',
    error: null,
  });
  await openSession();
  return true;
}

/** Chiude la sessione (utente o errore lato client). */
export function stopVoiceSession() {
  endSession(null);
}

/** Invia una domanda di testo (accessibilità / apertura da quiz). */
export function sendVoiceText(text: string) {
  if (!text.trim()) return;
  useVoiceStore.getState().appendUserTranscript(text);
  send({ realtimeInput: { text } });
}
