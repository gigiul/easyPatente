// Shared hybrid retrieval for explain-question and chat.

import { runRerankLLM } from "./llm.ts";
//
// Path A — sign-aware: when the image was identified offline (image_sign_type)
// AND the question belongs to a road-sign category, pin the manual chunk via
// sign_to_chunk. Generic T/F question texts ("Vero o Falso: questo segnale
// vieta la sosta?") retrieve wrong chunks with pure cosine similarity.
// The gate on the category protects against images whose sign was a false
// positive (e.g. a photo of a motorway sign on a non-sign question).
//
// Path B — category-scoped cosine fallback for everything else.

// Road-sign quiz categories → manual chapters (cap-02..cap-11).
export const SIGN_CATEGORY_IDS = new Set([
  "1c72e436-7a7f-4547-8f0e-b40f6fea7294", // Segnali di Pericolo (base)
  "d2b2c2d2-2222-4b2b-8b2b-222222222126", // Segnali di Pericolo (hard)
  "1a693ebd-3e77-49da-a5cb-aefd34af0d8e", // Segnali di Precedenza (base)
  "d3c3d3e3-3333-4c3c-8c3c-333333333127", // Segnali di Precedenza (hard)
  "1055628b-9e4a-4544-92fd-60167704c315", // Segnali di Divieto (base)
  "d4d4e4f4-4444-4d4d-8d4d-444444444128", // Segnali di Divieto (hard)
  "cfecfe52-5925-443e-a798-5adff605c489", // Segnali di Obbligo (base)
  "d5e5f5a5-5555-4e5e-8e5e-555555555129", // Segnali di Obbligo (hard)
  "fd787783-6b5b-4e0a-a0b4-2173aad17c37", // Segnali di Indicazione (base)
  "d1000001-aaaa-4a1a-8a1a-000000000001", // Segnali di Indicazione (hard)
  "4caf0f96-d5a9-49e7-b345-bae6277295b7", // Temporanei e di Cantiere (base)
  "d1000002-bbbb-4b2b-8b2b-000000000002", // Temporanei e di Cantiere (hard)
  "cf7cd590-6fdc-4c7c-8b64-6dbade75c49d", // Pannelli Integrativi (base)
  "d1000003-cccc-4c3c-8c3c-000000000003", // Pannelli Integrativi (hard)
  "9ae4ea7e-03e8-4f62-963a-ebea4fbb42e8", // Segnaletica Luminosa e Manuale (base)
  "d1000004-dddd-4d4d-8d4d-000000000004", // Segnaletica Luminosa e Manuale (hard)
  "add74848-59a1-4150-ba8b-1a01678ee745", // Segnaletica Orizzontale (base)
  "d1000005-eeee-4e5e-8e5e-000000000005", // Segnaletica Orizzontale (hard)
]);

// manual_chunks rows are tagged with the *base* category id only; the "hard"
// twin of a category (same sort_order, is_hard=true) has no chunks of its own.
// Map hard -> base so the category filter stays meaningful for the ~600
// questions that live in a hard sign category.
export async function resolveChunkCategory(supabase: any, categoryId: string): Promise<string> {
  const { data } = await supabase
    .from("categories").select("sort_order, is_hard").eq("id", categoryId).maybeSingle();
  if (!data?.is_hard) return categoryId;
  const { data: base } = await supabase
    .from("categories").select("id")
    .eq("sort_order", data.sort_order).eq("is_hard", false).maybeSingle();
  return base?.id ?? categoryId;
}

export function identifiedSignOf(imageSignType: string | null | undefined): string | null {
  return imageSignType && imageSignType !== "NON_IDENTIFICATO" ? imageSignType : null;
}

export interface RetrievalResult {
  chunks: any[];
  retrievalPath: "sign" | "cosine";
  identifiedSign: string | null;
  isSignQuestion: boolean;
  useSignPath: boolean;
  reranked: boolean;
}

const RERANK_SYSTEM = `Sei un assistente di scuola guida. Ricevi una domanda e dei frammenti numerati del manuale.
Indica SOLO il numero del frammento che tratta dell'argomento specifico della domanda (il segnale o la situazione di cui parla).
Rispondi esclusivamente con un numero, nient'altro. Se nessun frammento è pertinente rispondi con 0.`;

// Con la similarità testuale il frammento giusto arriva spesso al rango 3-4: il
// testo della domanda ("si trova anche fuori dei centri abitati") punta a un
// frammento diverso da quello più vicino al text embedding. Un rerank che usa
// solo la domanda lo riporta in testa. Best-effort: se fallisce si tiene
// l'ordine del cosine.
export async function rerankByQuestion(questionText: string, chunks: any[]): Promise<any[]> {
  if (chunks.length < 2 || !questionText) return chunks;

  const fragments = chunks
    .map((c, i) => `[${i + 1}] ${(c.text || "").slice(0, 700)}`)
    .join("\n\n");

  const answer = await runRerankLLM(
    RERANK_SYSTEM,
    `Domanda: ${questionText}\n\nFrammenti:\n${fragments}`,
  );
  const match = answer.match(/\d+/);
  if (!match) return chunks;

  const chosen = parseInt(match[0], 10) - 1;
  if (!(chosen >= 0 && chosen < chunks.length)) return chunks;

  return [chunks[chosen], ...chunks.filter((_, i) => i !== chosen)];
}

export async function retrieveChunks(
  supabase: any,
  opts: {
    embedding: any;
    categoryId: string | null;
    imageSignType: string | null;
    matchCount?: number;
    filterLanguage?: string;
    /** Testo della domanda: serve solo per il re-rank del path cosine. */
    questionText?: string;
  }
): Promise<RetrievalResult> {
  const matchCount = opts.matchCount ?? 5;
  const filterLanguage = opts.filterLanguage ?? "it";

  const isSignQuestion = !!opts.categoryId && SIGN_CATEGORY_IDS.has(opts.categoryId);
  const identifiedSign = identifiedSignOf(opts.imageSignType);
  const useSignPath = isSignQuestion && !!identifiedSign;

  let chunks: any[] = [];
  let retrievalPath: "sign" | "cosine" = "cosine";
  let reranked = false;

  if (useSignPath) {
    const { data: signChunks, error: signError } = await supabase.rpc("match_chunks_by_sign", {
      p_sign_name: identifiedSign, p_query_embedding: opts.embedding,
      p_match_count: 3, p_filter_language: filterLanguage,
    });
    if (signError) {
      console.error("Sign retrieval failed, falling back to cosine:", signError);
    } else if (signChunks && signChunks.length) {
      chunks = signChunks;
      retrievalPath = "sign";
    }
  }

  if (chunks.length === 0) {
    const filterCategoryId = isSignQuestion && opts.categoryId
      ? await resolveChunkCategory(supabase, opts.categoryId)
      : null;

    const { data: embChunks, error: matchError } = await supabase.rpc("match_manual_chunks", {
      query_embedding: opts.embedding, match_count: matchCount, filter_language: filterLanguage,
      filter_category_id: filterCategoryId,
    });
    if (matchError) {
      console.error("Cosine retrieval failed:", matchError);
    } else {
      chunks = embChunks || [];
    }

    // Safety net: a category filter that matches nothing must degrade to
    // unfiltered cosine, never fail the request.
    if (chunks.length === 0 && filterCategoryId) {
      console.warn(`No chunks for category ${filterCategoryId}, retrying unfiltered`);
      const { data: plain, error: plainError } = await supabase.rpc("match_manual_chunks", {
        query_embedding: opts.embedding, match_count: matchCount, filter_language: filterLanguage,
        filter_category_id: null,
      });
      if (!plainError) chunks = plain || [];
    }
    retrievalPath = "cosine";

    // Solo le domande su segnali: sono le uniche dove il testo è generico
    // ("questo segnale...") e i 5 frammenti dello stesso capitolo si somigliano.
    if (isSignQuestion && !useSignPath && opts.questionText && chunks.length > 1) {
      const before = chunks.map((c: any) => c.text).join("\u0000");
      chunks = await rerankByQuestion(opts.questionText, chunks);
      reranked = chunks.map((c: any) => c.text).join("\u0000") !== before;
    }
  }

  return { chunks, retrievalPath, identifiedSign, isSignQuestion, useSignPath, reranked };
}

export function buildContext(chunks: any[]): string {
  return chunks.map((c: any) => {
    const meta = [
      c.chapter && `Capitolo: ${c.chapter}`,
      c.section && `Sezione: ${c.section}`,
      c.article_ref?.length && `Articoli: ${c.article_ref.join(", ")}`,
    ].filter(Boolean).join(" — ");
    return meta ? `${meta}\n${c.text}` : c.text;
  }).join("\n\n---\n\n");
}
