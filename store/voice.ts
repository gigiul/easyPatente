import { create } from 'zustand';

export type VoiceStatus =
  | 'idle'        // nessuna sessione
  | 'connecting'  // WS + auth + setup Gemini
  | 'listening'   // microfono aperto, in attesa/ascolto
  | 'thinking'    // tool RAG / generazione in corso
  | 'speaking';   // risposta in riproduzione

/** Codici errore traducibili via i18n (`voice.errors.*` in Fase 4). */
export type VoiceErrorCode =
  | 'auth'          // 4401 / manca sessione
  | 'notEnabled'    // 4403 has_ai=false
  | 'rateLimit'     // 4429 limite giornaliero
  | 'idle'          // 4408 sessione chiusa per inattività
  | 'sessionEnded'  // 4000 cap durata / chiusura pulita
  | 'connection'    // errore WS / upstream
  | 'micDenied';    // permesso microfono negato

interface VoiceState {
  active: boolean;
  status: VoiceStatus;
  /** Trascrizione parziale (in tempo reale) del turno utente in corso. */
  userTranscript: string;
  /** Trascrizione parziale (in tempo reale) della risposta in corso. */
  assistantTranscript: string;
  error: VoiceErrorCode | null;

  setActive: (active: boolean) => void;
  setStatus: (status: VoiceStatus) => void;
  appendUserTranscript: (text: string) => void;
  appendAssistantTranscript: (text: string) => void;
  setError: (error: VoiceErrorCode | null) => void;
  /** Azzera le trascrizioni a fine turno (senza chiudere la sessione). */
  clearTurn: () => void;
  /** Chiusura sessione: stato pulito. */
  reset: () => void;
}

export const useVoiceStore = create<VoiceState>()((set) => ({
  active: false,
  status: 'idle',
  userTranscript: '',
  assistantTranscript: '',
  error: null,

  setActive: (active) => set({ active }),
  setStatus: (status) => set({ status }),
  appendUserTranscript: (text) =>
    set((s) => ({ userTranscript: s.userTranscript + text })),
  appendAssistantTranscript: (text) =>
    set((s) => ({ assistantTranscript: s.assistantTranscript + text })),
  setError: (error) => set({ error }),
  clearTurn: () => set({ userTranscript: '', assistantTranscript: '' }),
  reset: () =>
    set({ active: false, status: 'idle', userTranscript: '', assistantTranscript: '', error: null }),
}));
