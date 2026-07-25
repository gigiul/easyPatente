import { supabase } from '@/lib/supabase';
import { create } from 'zustand';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  status?: 'pending' | 'failed'; // undefined = messaggio confermato dal server
}

interface ChatResponse {
  response: string;
  remaining_requests: number;
  sources?: any[];
  error?: string;
}

interface ChatState {
  messages: ChatMessage[];
  loading: boolean;
  sending: boolean;
  error: string | null;
  remainingRequests: number;
  sendMessage: (text: string, langCode: string) => Promise<void>;
  retryMessage: (id: string, langCode: string) => Promise<void>;
  clearChat: () => Promise<void>;
  loadMessages: () => Promise<void>;
  loadRemainingRequests: () => Promise<void>;
  /** @internal logica condivisa tra sendMessage e retryMessage */
  _performSend: (userMsg: ChatMessage, langCode: string) => Promise<void>;
}

export const useChatStore = create<ChatState>()(
  (set, get) => ({
    messages: [],
    loading: false,
    sending: false,
    error: null,
    remainingRequests: 5,

    sendMessage: async (text: string, langCode: string) => {
      set({ error: null });

      // 1. Optimistic update: il messaggio utente appare subito nella UI
      const userMsg: ChatMessage = {
        id: generateUUID(),
        role: 'user',
        content: text,
        created_at: new Date().toISOString(),
        status: 'pending',
      };

      set((state) => ({
        messages: [...state.messages, userMsg],
        sending: true,
      }));

      await get()._performSend(userMsg, langCode);
    },

    // Ritenta l'invio di un messaggio fallito, senza duplicarlo in lista
    retryMessage: async (id: string, langCode: string) => {
      const target = get().messages.find((m) => m.id === id);
      if (!target) return;

      set({ error: null, sending: true });
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === id ? { ...m, status: 'pending' } : m
        ),
      }));

      await get()._performSend(target, langCode);
    },

    // Logica condivisa tra sendMessage e retryMessage
    _performSend: async (userMsg: ChatMessage, langCode: string) => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error('Non autenticato');

        // Cronologia: ultimi messaggi confermati (esclude il pending corrente)
        const history = get()
          .messages.filter((m) => m.id !== userMsg.id && m.status !== 'failed')
          .slice(-10)
          .map((m) => ({ role: m.role, content: m.content }));

        const response = await fetch(
          `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/chat`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              message: userMsg.content,
              lang_code: langCode,
              history,
            }),
          }
        );

        const data: ChatResponse = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Errore nella richiesta');
        }

        const assistantMsg: ChatMessage = {
          id: generateUUID(),
          role: 'assistant',
          content: data.response,
          created_at: new Date().toISOString(),
        };

        // 2. Conferma il messaggio utente e aggiunge la risposta
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === userMsg.id ? { ...m, status: undefined } : m
          ).concat(assistantMsg),
          remainingRequests: data.remaining_requests,
        }));
      } catch (error: any) {
        // 3. Rollback "soft": il messaggio resta in lista ma segnato come failed,
        // così l'utente può vedere cosa ha scritto e ritentare senza doverlo riscrivere
        set((state) => ({
          error: error.message,
          messages: state.messages.map((m) =>
            m.id === userMsg.id ? { ...m, status: 'failed' } : m
          ),
        }));
      } finally {
        set({ sending: false });
      }
    },

    clearChat: async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) return;

        // Elimina tutti i messaggi dell'utente dal database
        await supabase
          .from('chat_messages')
          .delete()
          .eq('user_id', session.user.id);

        // Resetta lo stato locale
        set({ messages: [], error: null });
      } catch (error) {
        console.error('Failed to clear chat:', error);
      }
    },

    loadMessages: async () => {
      set({ loading: true });
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) return;

        const { data } = await supabase
          .from('chat_messages')
          .select('id, role, content, created_at')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: true });

        if (data) {
          set({ messages: data });
        }
      } catch (error) {
        console.error('Failed to load messages:', error);
      } finally {
        set({ loading: false });
      }
    },

    loadRemainingRequests: async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) return;

        const { data: profile } = await supabase
          .from('profiles')
          .select('request_count, last_request_at')
          .eq('id', session.user.id)
          .single();

        if (profile) {
          const now = new Date();
          const lastRequest = profile.last_request_at
            ? new Date(profile.last_request_at)
            : null;

          let count = profile.request_count || 0;
          if (lastRequest && lastRequest.toDateString() !== now.toDateString()) {
            count = 0;
          }

          set({ remainingRequests: 5 - count });
        }
      } catch (error) {
        console.error('Failed to load remaining requests:', error);
      }
    },
  })
);