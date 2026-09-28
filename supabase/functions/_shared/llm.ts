// Shared LLM transport used by explain-question and chat.
//
// Everything that used to be duplicated in each function lives here so that a
// fix (retry, thought-part parsing, empty-answer guard) applies to both.

import {
  LLM_PROVIDER, LLM_ENDPOINT, LLM_MODEL,
  GEMINI_API_KEY, GEMINI_MODEL,
} from "./env.ts";

// Modello usato solo per il re-rank dei chunk: deve essere istantaneo e senza
// reasoning, altrimenti ogni spiegazione costerebbe +15s.
const RERANK_MODEL = Deno.env.get("GEMINI_RERANK_MODEL") || "gemini-flash-lite-latest";

// ── Gemini ──

// The Gemini free tier intermittently answers 429/503 ("high demand",
// "quota exceeded"). Those are transient, so retry with backoff before
// giving up; only a 4xx (other than 429) is a real configuration error.
const GEMINI_MAX_ATTEMPTS = 4;
const GEMINI_RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

async function geminiFetch(model: string, body: string): Promise<Response> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  let lastRes: Response | null = null;
  let lastErr: string = "";
  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-goog-api-key": GEMINI_API_KEY },
        body,
      });
      if (res.ok) return res;

      lastRes = res.clone();
      lastErr = await res.text();
      if (!GEMINI_RETRYABLE_STATUS.has(res.status)) break;
    } catch (e) {
      lastErr = String(e);
      if (attempt === GEMINI_MAX_ATTEMPTS) break;
    }
    if (attempt < GEMINI_MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 800 * 2 ** (attempt - 1)));
    }
  }
  const status = lastRes ? lastRes.status : 0;
  console.error(`Gemini error [${status}]: ${lastErr}`);
  throw new Error(`Gemini API unavailable (HTTP ${status}): ${lastErr.slice(0, 300)}`);
}

// Gemma/Flash may return reasoning parts flagged `thought: true`; the actual
// answer is the last non-thought part, so never read parts[0] blindly.
export function extractGeminiText(data: any): string {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  // Never fall back to the reasoning parts: on a reasoning model whose whole
  // output budget went into thinking, that would return the internal monologue
  // as if it were the answer. An empty result here triggers the retry instead.
  return parts.filter((p: any) => p?.text && !p.thought).map((p: any) => p.text).join("").trim();
}

function geminiFinishReason(data: any): string {
  return data?.candidates?.[0]?.finishReason || "UNKNOWN";
}

// A reasoning model (gemma-4) can spend the whole output budget on thinking
// (finishReason=MAX_TOKENS) leaving no answer part at all — the client then saw
// "Empty response from LLM". So retry once with a much larger budget, and never
// hand an empty string back to the caller.
const GEMINI_TOKENS_DEFAULT = 4096;
const GEMINI_TOKENS_RETRY = 16384;

async function geminiComplete(systemPrompt: string, bodyFor: (maxTokens: number) => string): Promise<string> {
  const budgets = [GEMINI_TOKENS_DEFAULT, GEMINI_TOKENS_RETRY];
  let lastReason = "UNKNOWN";
  for (let i = 0; i < budgets.length; i++) {
    const res = await geminiFetch(GEMINI_MODEL, bodyFor(budgets[i]));
    const data = await res.json();
    const text = extractGeminiText(data);
    if (text) return text;
    lastReason = geminiFinishReason(data);
    console.warn(
      `Empty Gemini answer (attempt ${i + 1}/${budgets.length}, finishReason=${lastReason}, ` +
      `thoughts=${data?.usageMetadata?.thoughtsTokenCount ?? "?"}); retrying with a larger budget`
    );
  }
  throw new Error(`Gemini returned an empty answer (finishReason=${lastReason})`);
}

async function geminiText(systemPrompt: string, messages: { role: string; content: string }[]): Promise<string> {
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : m.role,
    parts: [{ text: m.content }],
  }));

  return geminiComplete(systemPrompt, (maxOutputTokens) => JSON.stringify({
    contents,
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: { temperature: 0.7, maxOutputTokens },
  }));
}

async function geminiImage(systemPrompt: string, prompt: string, imageBase64: string): Promise<string> {
  const match = imageBase64.match(/^data:(image\/\w+);base64,(.+)$/);
  const mimeType = match?.[1] || "image/png";
  const base64Data = match?.[2] || imageBase64;

  return geminiComplete(systemPrompt, (maxOutputTokens) => JSON.stringify({
    contents: [{
      role: "user",
      parts: [
        { text: prompt },
        { inlineData: { mimeType, data: base64Data } },
      ],
    }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: { temperature: 0.7, maxOutputTokens },
  }));
}

// ── LM Studio (local fallback) ──

async function lmstudioText(systemPrompt: string, messages: { role: string; content: string }[]): Promise<string> {
  const res = await fetch(`${LLM_ENDPOINT}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      max_tokens: 4096,
      temperature: 0.7,
      reasoning: "off",
    }),
  });
  if (!res.ok) {
    console.error(`LM Studio error: ${await res.text()}`);
    throw new Error("LLM service unavailable");
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

async function lmstudioImage(systemPrompt: string, prompt: string, imageBase64: string): Promise<string> {
  const content = [
    { type: "text", text: prompt },
    { type: "image_url", image_url: { url: imageBase64 } },
  ];
  const res = await fetch(`${LLM_ENDPOINT}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content },
      ],
      max_tokens: 4096,
      temperature: 0.7,
      reasoning: "off",
    }),
  });
  if (!res.ok) throw new Error("LLM service unavailable");
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

// ── Public API ──

export async function runLLM(systemPrompt: string, messages: { role: string; content: string }[]): Promise<string> {
  return LLM_PROVIDER === "gemini"
    ? geminiText(systemPrompt, messages)
    : lmstudioText(systemPrompt, messages);
}

export async function runLLMWithImage(systemPrompt: string, prompt: string, imageBase64: string): Promise<string> {
  return LLM_PROVIDER === "gemini"
    ? geminiImage(systemPrompt, prompt, imageBase64)
    : lmstudioImage(systemPrompt, prompt, imageBase64);
}


// ── Re-rank ──
// Piccola call a un modello veloce che sceglie quale dei frammenti recuperati
// è davvero pertinente alla domanda. Serve perché con la similarità solo
// testuale il frammento giusto arriva spesso al rango 3-4 e il modello si
// affida al primo. In caso di errore o risposta inutile si tiene l'ordine
// originale: il rerank è best-effort, non un vincolo.
export async function runRerankLLM(systemPrompt: string, userContent: string): Promise<string> {
  if (LLM_PROVIDER !== "gemini") return "";
  try {
    const res = await geminiFetch(RERANK_MODEL, JSON.stringify({
      contents: [{ role: "user", parts: [{ text: userContent }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { temperature: 0, maxOutputTokens: 64 },
    }));
    if (!res.ok) return "";
    return extractGeminiText(await res.json());
  } catch (e) {
    console.warn("rerank failed:", e);
    return "";
  }
}
