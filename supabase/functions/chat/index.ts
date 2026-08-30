import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Config ──
const LLM_PROVIDER = Deno.env.get("LLM_PROVIDER") || "lmstudio"; // "lmstudio" | "gemini"
const LLM_ENDPOINT = Deno.env.get("LLM_ENDPOINT") || "http://localhost:1234";
const LLM_MODEL = Deno.env.get("LLM_MODEL") || "lm-studio";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-flash-latest";
const EMBEDDING_PROVIDER = Deno.env.get("EMBEDDING_PROVIDER") || "cloudflare"; // "lmstudio" | "cloudflare"
const EMBEDDING_MODEL = Deno.env.get("EMBEDDING_MODEL") || "@cf/google/embeddinggemma-300m";
const CLOUDFLARE_ACCOUNT_ID = Deno.env.get("CLOUDFLARE_ACCOUNT_ID") || "";
const CLOUDFLARE_API_TOKEN = Deno.env.get("CLOUDFLARE_API_TOKEN") || "";

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SECRET_KEYS")!
  );

  try {
    const { message, lang_code = "it", history = [] } = await req.json();
    if (!message) return json({ error: "message required" }, 400);

    // ── 1. Authenticate user ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    // ── 2. Retrieve profile ──
    const { data: profile } = await supabase
      .from("profiles")
      .select("has_ai, request_count, last_request_at, chat_daily_limit")
      .eq("id", user.id)
      .single();

    if (!profile?.has_ai) {
      return json({ error: "Chat AI non attiva per il tuo account", code: "AI_NOT_ENABLED" }, 403);
    }

    const dailyLimit = profile.chat_daily_limit ?? 20;

    // ── 3. Rate limit (resets at midnight) ──
    const now = new Date();
    const lastRequest = profile.last_request_at ? new Date(profile.last_request_at) : null;
    let requestCount = profile.request_count || 0;

    if (lastRequest && lastRequest.toDateString() !== now.toDateString()) {
      requestCount = 0;
    }

    if (requestCount >= dailyLimit) {
      return json({
        error: `Hai raggiunto il limite di ${dailyLimit} richieste giornaliere. Torna domani!`,
        code: "RATE_LIMIT",
        remaining_requests: 0,
      }, 429);
    }

    // ── 4. Generate embedding ──
    const embedding = await generateEmbedding(message);

    // ── 5. Search relevant chunks ──
    const { data: chunks } = await supabase.rpc("match_manual_chunks", {
      query_embedding: embedding,
      match_count: 5,
      filter_language: "it",
    });

    console.debug("chunks", JSON.stringify(chunks))

    const contextText = (chunks || [])
      .map((c: any) => {
        const meta = [
          c.chapter && `Capitolo: ${c.chapter}`,
          c.section && `Sezione: ${c.section}`,
        ].filter(Boolean).join(" — ");
        return meta ? `${meta}\n${c.text}` : c.text;
      })
      .join("\n\n---\n\n");

    // ── 6. Call LLM ──
    const systemPrompt = `
Sei un assistente di scuola guida esperto che fa riferimento alle normative del 2026.

Regole:
- Rileva la lingua della domanda e rispondi SEMPRE nella stessa lingua.
- Rispondi in modo diretto e conciso.
- NON usare frasi come "secondo il contesto", "in base al testo", "come indicato", "dal documento", ecc.
- Se la domanda non riguarda la patente o la guida, rispondi che puoi aiutare solo con argomenti di scuola guida.

Formato della risposta:
- Restituisci SEMPRE Markdown valido e pulito.
- Non inserire caratteri di escape come \\" o \\n.
- Usa elenchi solo quando sono réellement utili.
- Per gli elenchi usa "-" e non "*".
- Mantieni un'unica riga vuota tra paragrafi ed elenchi.
- Non usare HTML.
- Non racchiudere la risposta in blocchi di codice (\`\`\`).
`;

    // Build messages for context
    const userMessages = history.map((msg: any) => ({
      role: msg.role,
      content: msg.content,
    }));
    userMessages.push({
      role: "user",
      content: `Contesto:\n${contextText}\n\nDomanda: ${message}`,
    });

    const response = await callLLM(systemPrompt, userMessages);

    if (!response) return json({ error: "Empty response from LLM" }, 500);

    // ── 7. Save messages ──
    await supabase.from("chat_messages").insert([
      { user_id: user.id, role: "user", content: message },
      { user_id: user.id, role: "assistant", content: response },
    ]);

    // ── 8. Increment counter ──
    await supabase
      .from("profiles")
      .update({
        request_count: requestCount + 1,
        last_request_at: now.toISOString(),
      })
      .eq("id", user.id);

    // ── 9. Return response ──
    const remainingRequests = dailyLimit - (requestCount + 1);

    return json({
      response,
      remaining_requests: remainingRequests,
      sources: (chunks || []).slice(0, 3).map((c: any) => ({
        chapter: c.chapter,
        section: c.section,
      })),
    });
  } catch (error) {
    console.error("Error:", error);
    return json({ error: error.message || "Internal error" }, 500);
  }
});

// ── LLM Helper ──

async function callLLM(systemPrompt: string, messages: { role: string; content: string }[]): Promise<string> {
  if (LLM_PROVIDER === "gemini") {
    return callGemini(systemPrompt, messages);
  }
  return callLMStudio(systemPrompt, messages);
}

async function callGemini(systemPrompt: string, messages: { role: string; content: string }[]): Promise<string> {
  // Gemini uses "user" and "model" (not "assistant")
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : m.role,
    parts: [{ text: m.content }],
  }));

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-goog-api-key": GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4096,
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error(`Gemini error: ${err}`);
    throw new Error("Gemini API unavailable");
  }

  const data = await res.json();
  console.debug("Gemini response", JSON.stringify(data))
  const candidate = data.candidates?.[0];
  if (!candidate) return "";

  return (
    candidate.content.parts
      .filter((part: any) => !part.thought && typeof part.text === "string")
      .map((part: any) => part.text)
      .join("")
      .trim()
  );
}

async function callLMStudio(systemPrompt: string, messages: { role: string; content: string }[]): Promise<string> {
  const allMessages = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];

  const res = await fetch(`${LLM_ENDPOINT}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: allMessages,
      max_tokens: 4096,
      temperature: 0.7,
      reasoning: "off",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`LM Studio error: ${err}`);
    throw new Error("LLM service unavailable");
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

// ── Embedding ──

async function generateEmbedding(text: string): Promise<number[]> {
  if (EMBEDDING_PROVIDER === "cloudflare") {
    return generateEmbeddingCloudflare(text);
  }
  return generateEmbeddingLMStudio(text);
}

async function generateEmbeddingCloudflare(text: string): Promise<number[]> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/google/embeddinggemma-300m`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${CLOUDFLARE_API_TOKEN}`,
      },
      body: JSON.stringify({ text: [text] }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    console.error(`Cloudflare embedding error: ${err}`);
    throw new Error("Cloudflare embedding failed");
  }
  const data = await res.json();
  return data.result?.data?.[0] || [];
}

async function generateEmbeddingLMStudio(text: string): Promise<number[]> {
  const res = await fetch(`${LLM_ENDPOINT}/v1/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  });
  if (!res.ok) throw new Error("Embedding failed");
  const data = await res.json();
  return data.data[0].embedding;
}

// ── Helper ──

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
