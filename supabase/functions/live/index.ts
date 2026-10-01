// Fase 2 — WebSocket proxy client ↔ Gemini Live con RAG, auth, rate limit e
// persistenza (doc/PLAN_VOICE_CHAT.md).
//
// Protocollo client:
//   1. connessione con ?access_token=<jwt>  (guard: auth → has_ai → rate limit)
//   2. proxy → {"proxyStatus":{"type":"auth_ok"|"auth_error",...}}  (auth_error → close 4401/4403/4429)
//   3. client → {"hello": {"lang_code":"it", "question_id":null}}
//   4. proxy → apre WSS upstream, invia setup a Gemini, inoltra {"setupComplete"}
//   5. client ↔ proxy inoltrano i messaggi Live API standard (realtimeInput, serverContent)
//   6. proxy intercetta toolCall → retrieveForVoice → toolResponse upstream;
//      emette {"proxyStatus":{"type":"tool_latency"|"rate"|...}}
//   7. a ogni turnComplete: trascrizioni accumulate → chat_messages + 1 richiesta
//      consumata (D9, solo se il turno ha prodotto una risposta)
//
// Chiusure: 4000=session cap (VOICE_SESSION_MAX_SECONDS), 4401/4403/4429=guard,
//           4408=idle (VOICE_IDLE_SECONDS), 1011=upstream.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { json } from "../_shared/cors.ts";
import { consumeChatRequest, createAdminClient, guardChatAccess, type GuardOk } from "../_shared/guards.ts";
import { retrieveForVoice } from "../_shared/retrieval.ts";

const MODEL = Deno.env.get("GEMINI_LIVE_MODEL") || "gemini-3.8-live";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const SESSION_MAX_S = Number(Deno.env.get("VOICE_SESSION_MAX_SECONDS") || "300");
const IDLE_S = Number(Deno.env.get("VOICE_IDLE_SECONDS") || "120");
const HISTORY_TURNS = 6;
const UPSTREAM_URL =
  `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;

// Terminologia di dominio per l'ASR (customVocabulary, max 1000 termini).
// I nomi dei segnali arrivano da sign_to_chunk a ogni connessione (freschi);
// VOICE_CUSTOM_VOCAB (comma-separated) aggiunge ulteriori termini.
const BASE_VOCAB = [
  "Codice della Strada", "patente B", "patente AM", "patente A1", "patente A2",
  "esame di teoria", "esame pratico", "scuola guida", "libretto", "foglio rosa",
  "centro rilevamento velocità", "CTR", "zona a traffico limitato", "ZTL",
  "divieto di sosta", "divieto di fermata", "divieto di transito", "divieto di ingresso",
  "dare precedenza", "diritto di precedenza", "senso unico", "doppio senso",
  "corsia di sorpasso", "pedana", "zebra", "distanziamento", "defaticamento",
  "portata", "targa", "gancio traino", "codice della strada 2026",
];

const SYSTEM_INSTRUCTION = `Sei l'assistente vocale di EasyPatente, un'app per preparare l'esame della patente di guida italiana.

REGOLA FONDAMENTALE: prima di rispondere a QUALSIASI domanda su esame, Codice della Strada o segnali stradali, DEVI chiamare lo strumento retrieve_manual_context e basare la risposta ESCLUSIVAMENTE sui frammenti di contesto restituiti. Non rispondere mai da memoria.

Se lo strumento restituisce status "no_results", dillo all'utente invece di riprovare con variazioni della domanda.
Se lo strumento restituisce status "rate_limit", dillo all'utente e non continuare.
Non eseguire più di due chiamate consecutive a strumenti senza parlare con l'utente.
Se nel contesto c'è la "Domanda corrente del quiz" e l'utente parla di "questa domanda" (o riferimenti ambigui come "perché è vera?"), intende quella: chiamalo subito retrieve_manual_context con quello che hai capito e rispondi sulla base del contesto. Chiedi chiarimenti solo se non hai né domanda né argomento con cui cercare.

Rispondi in modo diretto e conciso, come un tutor di scuola guida. Usa un linguaggio naturale adatto alla conversazione vocale: niente markdown, niente elenchi puntati, niente simboli da leggere letteralmente.`;

const TOOLS = [{
  functionDeclarations: [{
    name: "retrieve_manual_context",
    description:
      "Cerca nel manuale ufficiale della patente i frammenti rilevanti per la domanda dell'utente. DEVE essere chiamata prima di ogni risposta su argomenti dell'esame, del Codice della Strada o dei segnali stradali.",
    parameters: {
      type: "OBJECT",
      properties: {
        question: {
          type: "STRING",
          description: "La domanda dell'utente, in forma autonoma e completa.",
        },
      },
      required: ["question"],
    },
    behavior: "BLOCKING",
  }],
}];

// Gemini incapsula i messaggi JSON in frame WebSocket binari (UTF-8): vanno decodificati,
// altrimenti ogni messaggio upstream viene silenziosamente droppato.
async function toText(data: unknown): Promise<string> {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data.buffer);
  if (data instanceof Blob) return await data.text();
  return String(data);
}

serve((req) => {
  const upgrade = req.headers.get("upgrade") || "";
  if (upgrade.toLowerCase() !== "websocket") {
    return json(
      { error: "websocket upgrade required", model: MODEL, has_api_key: !!GEMINI_API_KEY, session_max_s: SESSION_MAX_S, idle_s: IDLE_S },
      426,
    );
  }

  const accessToken = new URL(req.url).searchParams.get("access_token");
  const { socket: client, response } = Deno.upgradeWebSocket(req);

  const supabase = createAdminClient();
  let guard: GuardOk | null = null;
  let authState: "pending" | "ok" | "failed" = "pending";

  let upstream: WebSocket | null = null;
  let setupSent = false;
  let hello: Record<string, unknown> = {};
  let sessionQuestionId: string | null = null;
  let sessionQuestionText: string | null = null;
  let sessionLang = "it";
  let recentHistory: { role: string; content: string }[] = [];
  let vocab: string[] = [...BASE_VOCAB];

  let usedRequests = 0;
  let inputAcc = "";
  let outputAcc = "";
  // I testi in realtimeInput.text non producono inputTranscription: tienili come
  // fallback per la riga "user" (l'audio produce inputTranscription normalmente).
  let textInputAcc = "";

  const pending: string[] = [];
  const tStart = Date.now();
  let closing = false;
  let capTimer: number | undefined;
  let idleTimer: number | undefined;

  const log = (...args: unknown[]) => console.log(`[live +${((Date.now() - tStart) / 1000).toFixed(1)}s]`, ...args);

  // L'handshake WebSocket del client può completarsi dopo i primi eventi:
  // accodare finché CONNECTING, flush a open (altrimenti auth_error viene perso).
  const outbox: string[] = [];
  const sendClient = (obj: unknown) => {
    const data = JSON.stringify(obj);
    if (client.readyState === WebSocket.OPEN) client.send(data);
    else if (client.readyState === WebSocket.CONNECTING) outbox.push(data);
  };
  client.addEventListener("open", () => {
    for (const m of outbox.splice(0)) client.send(m);
  });

  const closeAll = (reason: string, code = 1000) => {
    if (closing) return;
    closing = true;
    if (capTimer) clearTimeout(capTimer);
    if (idleTimer) clearTimeout(idleTimer);
    if (inputAcc || outputAcc) void finishTurn(); // non perdere trascrizioni a fine sessione
    log(`closing (${reason}) after ${Date.now() - tStart}ms`);
    sendClient({ proxyStatus: { type: "closing", reason, code, uptime_ms: Date.now() - tStart } });
    try { client.close(code, reason); } catch { /* already closed */ }
    try { upstream?.close(code, reason); } catch { /* already closed */ }
  };

  const resetIdle = () => {
    if (closing || authState !== "ok") return;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => closeAll("idle", 4408), IDLE_S * 1000);
  };

  // Anti-EarlyDrop: sul runtime hosted il worker viene ritirato se non c'è
  // lavoro pending. Tenere una promise pendente fino alla chiusura del socket.
  const clientClosed = new Promise<void>((resolve) => {
    client.addEventListener("close", () => resolve());
    client.addEventListener("error", () => resolve());
  });
  (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime
    ?.waitUntil(clientClosed);

  // ── Turno completato: persistisci trascrizioni + consuma 1 richiesta (D9) ──
  async function finishTurn() {
    const userText = inputAcc.trim() || textInputAcc.trim();
    const assistantText = outputAcc.trim();
    inputAcc = "";
    outputAcc = "";
    textInputAcc = "";
    if (!userText && !assistantText) return;
    if (!guard) return;
    try {
      const rows: Record<string, unknown>[] = [];
      if (userText) rows.push({ user_id: guard.user.id, role: "user", content: userText });
      if (assistantText) rows.push({ user_id: guard.user.id, role: "assistant", content: assistantText });
      if (rows.length) await supabase.from("chat_messages").insert(rows);

      if (assistantText && usedRequests < guard.dailyLimit) {
        await consumeChatRequest(supabase, guard.user.id, usedRequests, new Date());
        usedRequests++;
        sendClient({ proxyStatus: { type: "rate", used: usedRequests, daily_limit: guard.dailyLimit, remaining: Math.max(0, guard.dailyLimit - usedRequests) } });
      }
      log(`persisted turn: user=${userText.length}ch assistant=${assistantText.length}ch used=${usedRequests}/${guard.dailyLimit}`);
    } catch (err) {
      log("persist error:", err);
    }
  }

  async function handleToolCalls(calls: Record<string, unknown>[]) {
    const responses = [];
    for (const call of calls) {
      const name = String(call.name ?? "");
      const id = String(call.id ?? "");
      const t0 = performance.now();
      let res: Record<string, unknown>;

      if (name !== "retrieve_manual_context") {
        res = { status: "invalid_argument", retryable: false, message: `Strumento sconosciuto: ${name}` };
      } else if (guard && usedRequests >= guard.dailyLimit) {
        // Limite giornaliero raggiunto in sessione: il modello lo comunica.
        res = {
          status: "rate_limit",
          retryable: false,
          message: `Hai raggiunto il limite di ${guard.dailyLimit} richieste giornaliere. Dillo all'utente e chiudi la conversazione.`,
          context: "",
        };
        log(`tool ${name} refused: rate limit ${usedRequests}/${guard.dailyLimit}`);
      } else {
        const question = String((call.args as Record<string, unknown> | undefined)?.question ?? "");
        log(`toolCall ${id} "${question.slice(0, 80)}"`);
        try {
          const retrieval = await retrieveForVoice(supabase, {
            question,
            questionId: sessionQuestionId,
            langCode: sessionLang,
          });
          const totalMs = performance.now() - t0;
          res = retrieval.context || retrieval.chunks.length
            ? {
              status: "ok",
              retryable: false,
              message: retrieval.fromCache
                ? "Spiegazione già disponibile per questa domanda."
                : "Contesto del manuale recuperato.",
              context: retrieval.context,
              sources: retrieval.chunks.map((c: Record<string, unknown>) => ({ chapter: c.chapter, section: c.section })),
            }
            : {
              status: "no_results",
              retryable: false,
              message: "Nessun frammento rilevante nel manuale. Dillo all'utente e non riprovare con variazioni della domanda.",
              context: "",
            };
          sendClient({
            proxyStatus: {
              type: "tool_latency",
              tool: name,
              total_ms: Math.round(totalMs),
              path: retrieval.path,
              from_cache: retrieval.fromCache,
              chunks: retrieval.chunks.length,
            },
          });
          log(`tool ${name} in ${totalMs.toFixed(0)}ms (path=${retrieval.path}, cache=${retrieval.fromCache}, ${retrieval.chunks.length} chunks)`);
        } catch (err) {
          res = {
            status: "error",
            retryable: false,
            message: `Recupero contesto non riuscito: ${err instanceof Error ? err.message : String(err)}. Dillo all'utente.`,
            context: "",
          };
          sendClient({ proxyStatus: { type: "tool_error", error: String(err instanceof Error ? err.message : err) } });
          log(`tool error:`, err);
        }
      }
      responses.push({ id, name, response: res });
    }

    if (upstream?.readyState === WebSocket.OPEN) {
      upstream.send(JSON.stringify({ toolResponse: { functionResponses: responses } }));
    }
  }

  function buildSetup() {
    const hist = recentHistory.map((m) => `[${m.role === "assistant" ? "tutor" : "utente"}]: ${m.content}`).join("\n");
    const sys = [
      SYSTEM_INSTRUCTION,
      `Lingua della conversazione: ${sessionLang}.`,
      sessionQuestionText ? `Domanda corrente del quiz (l'utente vi fa riferimento con "questa domanda"):\n${sessionQuestionText}` : "",
      hist ? `Conversazione recente:\n${hist}` : "",
    ].filter(Boolean).join("\n\n");

    return {
      setup: {
        model: `models/${MODEL}`,
        generationConfig: { responseModalities: ["AUDIO"] },
        systemInstruction: { parts: [{ text: sys }] },
        inputAudioTranscription: { customVocabulary: vocab },
        outputAudioTranscription: {},
        tools: TOOLS,
      },
    };
  }

  function openUpstream() {
    log(`connecting upstream model=${MODEL}`);
    upstream = new WebSocket(UPSTREAM_URL);

    upstream.addEventListener("open", () => {
      log("upstream open, sending setup");
      upstream!.send(JSON.stringify(buildSetup()));
    });

    upstream.addEventListener("message", async (e) => {
      const raw = await toText(e.data);
      let msg: Record<string, any>;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }

      if (!setupSent) log("upstream (pre-setup):", raw.slice(0, 600));
      if (msg.error) log("upstream ERROR:", JSON.stringify(msg.error).slice(0, 800));

      if (msg.setupComplete && !setupSent) {
        setupSent = true;
        if (!capTimer) {
          capTimer = setTimeout(() => closeAll("session_limit", 4000), SESSION_MAX_S * 1000);
        }
        log("setupComplete, flushing pending client messages");
        sendClient({ proxyStatus: { type: "ready", model: MODEL, session_max_s: SESSION_MAX_S, idle_s: IDLE_S } });
        if (client.readyState === WebSocket.OPEN) client.send(raw);
        for (const p of pending.splice(0)) {
          if (upstream!.readyState === WebSocket.OPEN) upstream!.send(p);
        }
        return;
      }

      if (msg.toolCall) {
        // Intercettato: il client non lo vede, riceve solo proxyStatus
        void handleToolCalls(msg.toolCall.functionCalls ?? []);
        return;
      }

      if (msg.toolCallCancellation) {
        sendClient({ proxyStatus: { type: "tool_cancelled" } });
        log("toolCallCancellation:", JSON.stringify(msg.toolCallCancellation));
      }

      // Accumula trascrizioni per la persistenza a fine turno
      const sc = msg.serverContent;
      if (sc) {
        if (sc.inputTranscription?.text) inputAcc += sc.inputTranscription.text;
        if (sc.outputTranscription?.text) outputAcc += sc.outputTranscription.text;
        if (sc.turnComplete) void finishTurn();
      }

      if (client.readyState === WebSocket.OPEN) client.send(raw);
    });

    upstream.addEventListener("close", (e) => {
      log(`upstream closed code=${e.code} reason="${e.reason}"`);
      if (!closing) {
        sendClient({ proxyStatus: { type: "upstream_closed", code: e.code, reason: e.reason } });
        try { client.close(1011, "upstream_closed"); } catch { /* ignore */ }
        closing = true;
      }
    });

    upstream.addEventListener("error", (err) => {
      log("upstream error:", err);
      sendClient({ proxyStatus: { type: "upstream_error" } });
    });
  }

  async function handleClientMessage(raw: string) {
    resetIdle();
    let msg: Record<string, any>;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (!setupSent) {
      if (msg.hello) {
        hello = msg.hello;
        sessionQuestionId = typeof hello.question_id === "string" ? hello.question_id : null;
        sessionLang = typeof hello.lang_code === "string" ? hello.lang_code : "it";
        // Il modello deve sapere QUAL è la domanda corrente (riferimenti tipo
        // "questa domanda"): testo tradotto nel contesto, best-effort.
        if (sessionQuestionId) {
          try {
            const { data: q } = await supabase
              .from("questions")
              .select("id")
              .eq("id", sessionQuestionId)
              .maybeSingle();
            if (q) {
              const { data: tr } = await supabase
                .from("question_translations")
                .select("lang_code, text")
                .eq("question_id", sessionQuestionId)
                .in("lang_code", [...new Set([sessionLang, "it"])]);
              const byLang = new Map((tr ?? []).map((t: { lang_code: string; text: string }) => [t.lang_code, t.text]));
              sessionQuestionText = byLang.get(sessionLang) ?? byLang.get("it") ?? null;
            }
          } catch (err) {
            log("question context fetch error:", err);
          }
        }
        log("hello:", JSON.stringify(hello), "questionText:", sessionQuestionText ? "ok" : "none");
        if (!upstream) openUpstream();
      } else {
        pending.push(raw);
      }
      return;
    }

    if (msg.realtimeInput?.text) {
      textInputAcc += (textInputAcc ? " " : "") + String(msg.realtimeInput.text);
    }
    if (upstream?.readyState === WebSocket.OPEN) upstream.send(raw);
  }

  // ── Guard (auth → has_ai → rate limit) prima di aprire upstream ──
  void (async () => {
    const result = await guardChatAccess(supabase, accessToken);
    if (!result.ok) {
      authState = "failed";
      const code = result.status === 401 ? 4401 : result.status === 403 ? 4403 : 4429;
      sendClient({
        proxyStatus: {
          type: "auth_error",
          status: result.status,
          code: (result.body.code as string) ?? "UNAUTHORIZED",
          error: result.body.error,
        },
      });
      setTimeout(() => closeAll(`auth_${result.status}`, code), 100); // lascia il tempo all'evento di partire
      return;
    }

    guard = result;
    usedRequests = result.requestCount;
    authState = "ok";

    // Storico recente (iniettato nel systemInstruction) + vocabolario ASR fresco
    const [histRes, vocabRes] = await Promise.all([
      supabase.from("chat_messages").select("role, content").eq("user_id", result.user.id).order("created_at", { ascending: false }).limit(HISTORY_TURNS),
      supabase.from("sign_to_chunk").select("sign_name").limit(1000),
    ]);
    recentHistory = (histRes.data ?? []).reverse();
    const signNames = [...new Set((vocabRes.data ?? []).map((r: { sign_name: string }) => r.sign_name))];
    const extra = (Deno.env.get("VOICE_CUSTOM_VOCAB") || "").split(",").map((s) => s.trim()).filter(Boolean);
    vocab = [...new Set([...BASE_VOCAB, ...signNames, ...extra])].slice(0, 1000);

    sendClient({
      proxyStatus: {
        type: "auth_ok",
        user_id: result.user.id,
        daily_limit: result.dailyLimit,
        used: result.requestCount,
        remaining: result.remaining,
      },
    });
    log(`auth_ok user=${result.user.id} used=${result.requestCount}/${result.dailyLimit} history=${recentHistory.length} vocab=${vocab.length}`);

    // Replay dei messaggi arrivati prima dell'auth
    for (const raw of pending.splice(0)) await handleClientMessage(raw);
    resetIdle();
  })();

  client.addEventListener("message", async (e) => {
    const raw = await toText(e.data);
    if (authState !== "ok") {
      if (authState === "pending") pending.push(raw);
      return;
    }
    await handleClientMessage(raw);
  });

  client.addEventListener("close", (e) => {
    log(`client closed code=${e.code}`);
    closing = true;
    if (capTimer) clearTimeout(capTimer);
    if (idleTimer) clearTimeout(idleTimer);
    try { upstream?.close(1000, "client_closed"); } catch { /* ignore */ }
  });

  client.addEventListener("error", (err) => {
    log("client error:", err);
  });

  return response;
});
