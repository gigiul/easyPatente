import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { corsHeaders, json } from "../_shared/cors.ts";
import { generateEmbedding } from "../_shared/embedding.ts";
import { consumeChatRequest, createAdminClient, guardChatAccess } from "../_shared/guards.ts";
import { runLLM } from "../_shared/llm.ts";
import { buildContext, retrieveChunks } from "../_shared/retrieval.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  const supabase = createAdminClient();

  try {
    const { message, lang_code = "it", history = [], question_id } = await req.json();
    if (!message) return json({ error: "message required" }, 400);

    // ── 1-3. Auth + has_ai + rate limit (shared con `live`) ──
    const guard = await guardChatAccess(supabase, req.headers.get("Authorization"));
    if (!guard.ok) return json(guard.body, guard.status);
    const { user, requestCount, dailyLimit, now } = guard;

    // ── 3b. Contesto della domanda in corso (opzionale, passato dal quiz) ──
    // Consente alla chat di: (a) usare l'hibrid retrieval già usata da
    // explain-question (path segnale), (b) ripartire dalla spiegazione già
    // generata per la stessa domanda invece di rigenerare contesto analogo.
    let question: any = null;
    let cachedExplanation: string | null = null;
    if (question_id) {
      const { data: q } = await supabase
        .from("questions")
        .select("id, code, category_id, image_sign_type, embedding")
        .eq("id", question_id)
        .single();
      question = q ?? null;

      const { data: translations } = await supabase
        .from("question_translations")
        .select("lang_code, explanation")
        .eq("question_id", question_id)
        .in("lang_code", [...new Set([lang_code, "it"])]);
      const byLang = new Map((translations || []).map((t: any) => [t.lang_code, t.explanation]));
      cachedExplanation = byLang.get(lang_code) || byLang.get("it") || null;
    }

    // ── 4. Embedding + retrieval (ibrida se conosciamo la domanda) ──
    const embedding = question?.embedding ?? await generateEmbedding(message);

    let chunks: any[] = [];
    let retrievalPath = "cosine";
    let reranked = false;
    let questionSignNote: string | null = null;
    if (question) {
      const retrieval = await retrieveChunks(supabase, {
        embedding,
        categoryId: question.category_id,
        imageSignType: question.image_sign_type,
        questionText: message,
      });
      chunks = retrieval.chunks;
      retrievalPath = retrieval.retrievalPath;
      reranked = retrieval.reranked;
      if (retrieval.useSignPath && retrieval.identifiedSign) {
        // Contesto segnale: la risposta deve restare coerente con l'immagine
        questionSignNote =
          `Nota: l'immagine allegata alla domanda mostra il segnale stradale ` +
          `"${retrieval.identifiedSign}".`;
      }
    } else {
      const { data: cosineChunks } = await supabase.rpc("match_manual_chunks", {
        query_embedding: embedding,
        match_count: 5,
        filter_language: "it",
      });
      chunks = cosineChunks || [];
    }

    const contextText = buildContext(chunks);

    // ── 5. Call LLM ──
    const systemPrompt = `
Sei un assistente di scuola guida esperto che fa riferimento alle normative del 2026.

Regole:
- Rileva la lingua della domanda e rispondi SEMPRE nella stessa lingua.
- Rispondi in modo diretto e conciso.
- NON usare frasi come "secondo il contesto", "in base al testo", "come indicato", "dal documento", ecc.
- Se ti viene fornita la spiegazione già data per la domanda, usala come riferimento: non ripeterla verbatim salvo che te lo chiedano.
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

    const promptParts: string[] = [];
    if (contextText) promptParts.push(`Contesto dal manuale:\n${contextText}`);
    if (cachedExplanation) promptParts.push(`Spiegazione già fornita per la domanda:\n${cachedExplanation}`);
    if (questionSignNote) promptParts.push(questionSignNote);
    promptParts.push(`Domanda: ${message}`);

    // Build messages for context
    const userMessages = history.map((msg: any) => ({
      role: msg.role,
      content: msg.content,
    }));
    userMessages.push({ role: "user", content: promptParts.join("\n\n") });

    const response = await runLLM(systemPrompt, userMessages);

    if (!response) return json({ error: "Empty response from LLM" }, 500);

    // ── 6. Save messages ──
    await supabase.from("chat_messages").insert([
      { user_id: user.id, role: "user", content: message },
      { user_id: user.id, role: "assistant", content: response },
    ]);

    // ── 7. Increment counter ──
    await consumeChatRequest(supabase, user.id, requestCount, now);

    // ── 8. Return response ──
    const remainingRequests = dailyLimit - (requestCount + 1);

    return json({
      response,
      remaining_requests: remainingRequests,
      retrieval_path: retrievalPath, reranked,
      sources: chunks.slice(0, 3).map((c: any) => ({
        chapter: c.chapter,
        section: c.section,
      })),
    });
  } catch (error) {
    console.error("Error:", error);
    return json({ error: (error as Error)?.message || "Internal error" }, 500);
  }
});
