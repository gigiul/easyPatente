import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Config ──
const LLM_PROVIDER = Deno.env.get("LLM_PROVIDER") || "lmstudio"; // "lmstudio" | "gemini"
const LLM_ENDPOINT = Deno.env.get("LLM_ENDPOINT") || "http://localhost:8000";
const LLM_MODEL = Deno.env.get("LLM_MODEL") || "lm-studio";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-flash-latest";
const EMBEDDING_PROVIDER = Deno.env.get("EMBEDDING_PROVIDER") || "cloudflare"; // "lmstudio" | "cloudflare"
const EMBEDDING_MODEL = Deno.env.get("EMBEDDING_MODEL") || "@cf/google/embeddinggemma-300m";
const CLOUDFLARE_ACCOUNT_ID = Deno.env.get("CLOUDFLARE_ACCOUNT_ID") || "";
const CLOUDFLARE_API_TOKEN = Deno.env.get("CLOUDFLARE_API_TOKEN") || "";
const SUPABASE_STORAGE_URL = Deno.env.get("STORAGE_URL") || "";

const LANG_NAMES: Record<string, string> = {
  it: "italiano", es: "spagnolo", en: "inglese", fr: "francese",
  de: "tedesco", ar: "arabo", pt: "portoghese", ru: "russo",
  zh: "cinese", ja: "giapponese", ko: "coreano", bn: "bengalese", si: "singalese",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Road-sign quiz categories → manual chapters (cap-02..cap-11).
// When the question belongs to one of these, retrieval is scoped to the
// matching manual_chunks.category_id instead of searching all 554 chunks.
const SIGN_CATEGORY_IDS = new Set([
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SECRET_KEYS") ??
    Deno.env.get("SUPABASE_SECRET_KEY") ?? "";
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { question_id, question_text, lang_code = "it", secondary_lang } = await req.json();
    if (!question_id) return json({ error: "question_id required" }, 400);

    // ── 1. Cache: check if Italian explanation already exists ──
    const { data: italianTranslation } = await supabase
      .from("question_translations").select("explanation, text")
      .eq("question_id", question_id).eq("lang_code", "it").single();

    const italianExplanation = italianTranslation?.explanation;

    // ── 2. If Italian explanation exists, handle translations ──
    if (italianExplanation) {
      // Same observability as the fresh path: which sign did we see and would
      // we have used the sign-pinned path? (one PK lookup, cache hits are cheap)
      const { data: cachedQuestion } = await supabase
        .from("questions").select("image_sign_type, category_id")
        .eq("id", question_id).single();
      const cachedSign = cachedQuestion?.image_sign_type &&
        cachedQuestion.image_sign_type !== "NON_IDENTIFICATO"
        ? cachedQuestion.image_sign_type : null;
      const cachedIsSignQuestion = !!cachedQuestion?.category_id &&
        SIGN_CATEGORY_IDS.has(cachedQuestion.category_id);
      const cachedPath = cachedIsSignQuestion && cachedSign ? "sign" : "cosine";
      const cacheMeta = { retrieval_path: cachedPath, identified_sign: cachedSign };
      // If target language is Italian, return directly
      if (lang_code === "it") {
        let secondaryExplanation = null;
        if (secondary_lang && secondary_lang !== "it") {
          const { data: sec } = await supabase
            .from("question_translations").select("explanation")
            .eq("question_id", question_id).eq("lang_code", secondary_lang).single();
          if (sec?.explanation) {
            secondaryExplanation = sec.explanation;
          } else {
            // Translate from Italian
            const secLangName = LANG_NAMES[secondary_lang] || secondary_lang;
            secondaryExplanation = await callLLM(`Traduci in ${secLangName}. Restituisci SOLO la traduzione, senza aggiungere testo introduttivo o spiegazioni:\n\n${italianExplanation}`, secLangName);
            await supabase.from("question_translations").update({ explanation: secondaryExplanation })
              .eq("question_id", question_id).eq("lang_code", secondary_lang);
          }
        }
        return json({ explanation: italianExplanation, secondary_explanation: secondaryExplanation, sources: null, from_cache: true, ...cacheMeta });
      }

      // Check if translation already exists in target language
      const { data: targetTranslation } = await supabase
        .from("question_translations").select("explanation")
        .eq("question_id", question_id).eq("lang_code", lang_code).single();

      let targetExplanation = targetTranslation?.explanation;

      // If it doesn't exist, translate from Italian
      if (!targetExplanation) {
        const targetLangName = LANG_NAMES[lang_code] || lang_code;
        targetExplanation = await callLLM(`Traduci in ${targetLangName}. Restituisci SOLO la traduzione, senza aggiungere testo introduttivo o spiegazioni:\n\n${italianExplanation}`, targetLangName);
        await supabase.from("question_translations").update({ explanation: targetExplanation })
          .eq("question_id", question_id).eq("lang_code", lang_code);
      }

      // Handle secondary language
      let secondaryExplanation = null;
      if (secondary_lang && secondary_lang !== lang_code) {
        const { data: sec } = await supabase
          .from("question_translations").select("explanation")
          .eq("question_id", question_id).eq("lang_code", secondary_lang).single();
        if (sec?.explanation) {
          secondaryExplanation = sec.explanation;
        } else {
          const secLangName = LANG_NAMES[secondary_lang] || secondary_lang;
          secondaryExplanation = await callLLM(`Traduci in ${secLangName}. Restituisci SOLO la traduzione, senza aggiungere testo introduttivo o spiegazioni:\n\n${italianExplanation}`, secLangName);
          await supabase.from("question_translations").update({ explanation: secondaryExplanation })
            .eq("question_id", question_id).eq("lang_code", secondary_lang);
        }
      }

      return json({ explanation: targetExplanation, secondary_explanation: secondaryExplanation, sources: null, from_cache: true, ...cacheMeta });
    }

    // ── 3. No explanation exists: generate it in Italian first ──
    const { data: question } = await supabase
      .from("questions").select("id, code, embedding, image_filename, category_id, image_sign_type")
      .eq("id", question_id).single();
    if (!question) return json({ error: "Question not found" }, 404);

    // Fetch image
    let imageBase64: string | null = null;
    if (question.image_filename && SUPABASE_STORAGE_URL) {
      try {
        const imgUrl = `${SUPABASE_STORAGE_URL}/${question.image_filename}`;
        const imgRes = await fetch(imgUrl);
        if (imgRes.ok) {
          const buffer = await imgRes.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = "";
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
          const ext = question.image_filename.split(".").pop()?.toLowerCase() || "png";
          const mime = ext === "jpg" ? "jpeg" : ext;
          imageBase64 = `data:image/${mime};base64,${btoa(binary)}`;
        }
      } catch (e) { console.error("Image fetch error:", e); }
    }

    // Question embedding
    let embedding = question.embedding;
    if (!embedding) {
      const textToEmbed = question_text || italianTranslation?.text;
      if (!textToEmbed) return json({ error: "question_text required" }, 400);
      embedding = await generateTextEmbedding(textToEmbed);
      await supabase.from("questions").update({ embedding }).eq("id", question_id);
    }

    // Chunk matching (hybrid retrieval)
    //
    // Path A — sign-aware: when the image was identified offline (image_sign_type)
    // AND the question belongs to a road-sign category, pin the manual chunk via
    // sign_to_chunk. Generic T/F question texts ("Vero o Falso: questo segnale
    // vieta la sosta?") retrieve wrong chunks with pure cosine similarity.
    // The gate on the category protects against images whose sign was a false
    // positive (e.g. a photo of a motorway sign on a non-sign question).
    //
    // Path B — category-scoped cosine fallback for everything else.
    const isSignQuestion =
      !!question.category_id && SIGN_CATEGORY_IDS.has(question.category_id);
    const identifiedSign =
      question.image_sign_type && question.image_sign_type !== "NON_IDENTIFICATO"
        ? question.image_sign_type
        : null;
    const useSignPath = isSignQuestion && !!identifiedSign;

    let chunks: any[] = [];
    let retrievalPath: "sign" | "cosine" = "cosine";
    if (useSignPath) {
      const { data: signChunks, error: signError } = await supabase.rpc("match_chunks_by_sign", {
        p_sign_name: identifiedSign, p_query_embedding: embedding,
        p_match_count: 3, p_filter_language: "it",
      });
      if (signError) {
        console.error("Sign retrieval failed, falling back to cosine:", signError);
      } else {
        chunks = signChunks || [];
        retrievalPath = "sign";
      }
    }

    if (chunks.length === 0) {
      // manual_chunks is only indexed against the *base* categories: all 9
      // "hard" sign categories have zero chunks, so filtering by one of them
      // returned nothing and the request failed with "No relevant context
      // found". Every sort_order pairs exactly one base and one hard row, so
      // resolve hard -> base before filtering.
      const filterCategoryId = isSignQuestion
        ? await resolveChunkCategory(supabase, question.category_id)
        : null;
      const { data: embChunks, error: matchError } = await supabase.rpc("match_manual_chunks", {
        query_embedding: embedding, match_count: 5, filter_language: "it",
        filter_category_id: filterCategoryId,
      });
      if (matchError) return json({ error: "Chunk matching failed" }, 500);
      chunks = embChunks || [];

      // Safety net: a category filter that matches nothing must degrade to
      // unfiltered cosine, never fail the request.
      if (chunks.length === 0 && filterCategoryId) {
        console.warn(`No chunks for category ${filterCategoryId}, retrying unfiltered`);
        const { data: plain, error: plainError } = await supabase.rpc("match_manual_chunks", {
          query_embedding: embedding, match_count: 5, filter_language: "it",
          filter_category_id: null,
        });
        if (!plainError) chunks = plain || [];
      }
      retrievalPath = "cosine";
    }

    if (chunks.length === 0) return json({ error: "No relevant context found" }, 404);

    // Build prompt
    const contextText = chunks.map((c: any) => {
      const meta = [c.chapter && `Capitolo: ${c.chapter}`, c.section && `Sezione: ${c.section}`, c.article_ref?.length && `Articoli: ${c.article_ref.join(", ")}`].filter(Boolean).join(" — ");
      return meta ? `${meta}\n${c.text}` : c.text;
    }).join("\n\n---\n\n");

    const userText = question_text || italianTranslation?.text || question.code;

    // Tell the model which sign was identified offline: the retrieved context is
    // pinned to that sign, so the explanation stays consistent with the image
    // even when the question text is generic.
    const signAwarePrompt = useSignPath
      ? `L'immagine mostra il segnale stradale "${identifiedSign}".\n\n${userText}`
      : userText;

    // Generate explanation in Italian
    let generatedExplanation: string;
    if (imageBase64) {
      try {
        generatedExplanation = await callLLMWithImage(signAwarePrompt, contextText, "italiano", imageBase64);
      } catch (imgErr) {
        // Some providers/models reject inline images (or the image call can fail
        // transiently). The identified sign is already in the prompt, so the
        // text-only answer stays correct — degrade instead of failing.
        console.warn("Image call failed, falling back to text-only:", imgErr);
        generatedExplanation = await callLLM(textPrompt(signAwarePrompt, contextText, "italiano"), "italiano");
      }
    } else {
      generatedExplanation = await callLLM(textPrompt(signAwarePrompt, contextText, "italiano"), "italiano");
    }

    // An empty explanation would be cached forever and returned as
    // "Empty response from LLM" on every later call, so fail loudly instead.
    if (!generatedExplanation || !generatedExplanation.trim()) {
      console.error("Generated explanation is empty, refusing to cache it");
      return json({ error: "Empty response from LLM" }, 502);
    }

    // Save in Italian
    await supabase.from("question_translations").update({ explanation: generatedExplanation })
      .eq("question_id", question_id).eq("lang_code", "it");

    // If target language is Italian, return
    if (lang_code === "it") {
      return json({
        explanation: generatedExplanation, secondary_explanation: null, sources: null,
        from_cache: false, retrieval_path: retrievalPath, identified_sign: identifiedSign,
      });
    }

    // Translate to target language
    const targetLangName = LANG_NAMES[lang_code] || lang_code;
    const targetExplanation = await callLLM(`Traduci in ${targetLangName}. Restituisci SOLO la traduzione, senza aggiungere testo introduttivo o spiegazioni:\n\n${generatedExplanation}`, targetLangName);
    await supabase.from("question_translations").update({ explanation: targetExplanation })
      .eq("question_id", question_id).eq("lang_code", lang_code);

    // Handle secondary language
    let secondaryExplanation = null;
    if (secondary_lang && secondary_lang !== lang_code) {
      const { data: sec } = await supabase
        .from("question_translations").select("explanation")
        .eq("question_id", question_id).eq("lang_code", secondary_lang).single();
      if (sec?.explanation) {
        secondaryExplanation = sec.explanation;
      } else {
        const secLangName = LANG_NAMES[secondary_lang] || secondary_lang;
        secondaryExplanation = await callLLM(`Traduci in ${secLangName}. Restituisci SOLO la traduzione, senza aggiungere testo introduttivo o spiegazioni:\n\n${generatedExplanation}`, secLangName);
        await supabase.from("question_translations").update({ explanation: secondaryExplanation })
          .eq("question_id", question_id).eq("lang_code", secondary_lang);
      }
    }

    const sources = chunks.map((c: any) => ({
      chapter: c.chapter, section: c.section, page_start: c.page_start,
      page_end: c.page_end, article_ref: c.article_ref, keywords: c.keywords,
    }));

    return json({
      explanation: targetExplanation, secondary_explanation: secondaryExplanation, sources,
      has_image: !!imageBase64, from_cache: false,
      retrieval_path: retrievalPath, identified_sign: identifiedSign,
    });
  } catch (error) {
    console.error("Error:", error);
    return json({ error: (error as Error)?.message || "Internal error" }, 500);
  }
});

// ── Prompts ──

function textPrompt(question: string, context: string, lang: string): string {
  return `Spiega in MASSIMO 2 frasi perché la risposta è Vera o Falsa.
Basati solo sul contesto fornito. Non inventare. Non elencare tutti i segnali del manuale.

Contesto:
${context}

Domanda (Vero/Falso): ${question}

Rispondi in ${lang}. Termina con "Per questo la domanda è Vera." oppure "Per questo la domanda è Falsa."`;
}

// ── Few-shot examples ──

const FEW_SHOT_EXAMPLES = [
  {
    "description": "Triangolo con bordo rosso e freccia nera a forma di S che si snoda prima verso destra e poi verso sinistra",
    "sign": "Doppia curva, la prima a destra",
    "question": "Il segnale preannuncia una sola curva pericolosa a destra.",
    "answer": "Falsa"
  },
  {
    "description": "Triangolo con bordo rosso e due figure nere di bambini che corrono",
    "sign": "Bambini",
    "question": "Il segnale si trova nei pressi di scuole o giardini pubblici frequentati da fanciulli.",
    "answer": "Vera"
  },
  {
    "description": "Triangolo con bordo rosso e sagoma nera di un cervo che salta",
    "sign": "Animali selvatici vaganti",
    "question": "Il segnale impone il divieto di transito ai veicoli trainati da animali.",
    "answer": "Falsa"
  },
  {
    "description": "Triangolo con bordo rosso e sagoma nera di un'autovettura che lascia tracce ondulate sulla strada",
    "sign": "Strada sdrucciolevole",
    "question": "Il segnale preannuncia un tratto di strada che può diventare sdrucciolevole per ghiaccio o pioggia.",
    "answer": "Vera"
  },
  {
    "description": "Triangolo con bordo rosso e sagoma nera di un uomo che scava con una vanga",
    "sign": "Lavori",
    "question": "Il segnale indica la presenza di un cantiere stradale temporaneo.",
    "answer": "Vera"
  },
  {
    "description": "Cerchio rosso con barra orizzontale bianca al centro",
    "sign": "Senso vietato",
    "question": "Il segnale vieta l'ingresso a tutti i veicoli sulla strada in cui è posto.",
    "answer": "Vera"
  },
  {
    "description": "Cerchio bianco con bordo rosso",
    "sign": "Divieto di transito",
    "question": "Il segnale vieta la circolazione nei due sensi di marcia a tutti i veicoli.",
    "answer": "Vera"
  },
  {
    "description": "Cerchio blu con bordo rosso e due barre diagonali rosse incrociate a forma di X",
    "sign": "Divieto di fermata",
    "question": "Il segnale vieta la sosta ma consente la fermata breve per far salire o scendere passeggeri.",
    "answer": "Falsa"
  },
  {
    "description": "Cerchio con bordo rosso e due sagome di autovetture affiancate, quella a sinistra rossa e quella a destra nera",
    "sign": "Divieto di sorpasso",
    "question": "Il segnale consente il sorpasso dei veicoli privi di motore, come le biciclette.",
    "answer": "Vera"
  },
  {
    "description": "Cerchio con bordo rosso e sagoma nera di un carro trainato da un cavallo",
    "sign": "Divieto di transito ai veicoli a trazione animale",
    "question": "Il segnale vieta il transito ai quadrupedi da soma e da sella.",
    "answer": "Falsa"
  },
  {
    "description": "Cerchio grigio con numero 50 in nero sbarrato da cinque linee diagonali nere",
    "sign": "Fine del limite massimo di velocità",
    "question": "Il segnale indica la fine del divieto di superare la velocità di 50 km/h.",
    "answer": "Vera"
  },
  {
    "description": "Cerchio blu con freccia bianca rivolta verso destra",
    "sign": "Direzione obbligatoria a destra",
    "question": "Il segnale obbliga i conducenti a svoltare a destra all'incrocio.",
    "answer": "Vera"
  },
  {
    "description": "Cerchio blu con freccia bianca obliqua rivolta verso il basso a destra",
    "sign": "Passaggio obbligatorio a destra",
    "question": "Il segnale impone di svoltare alla prima strada a destra.",
    "answer": "Falsa"
  },
  {
    "description": "Cerchio blu con il disegno bianco di uno pneumatico munito di catene da neve",
    "sign": "Catene per neve obbligatorie",
    "question": "Il segnale consente il transito se il veicolo è equipaggiato con pneumatici invernali.",
    "answer": "Vera"
  },
  {
    "description": "Cerchio blu diviso verticalmente da una linea bianca con a sinistra il simbolo bianco della bicicletta e a destra il simbolo bianco del pedone",
    "sign": "Pista ciclabile contigua al marciapiede",
    "question": "Il segnale indica un percorso unico ad uso promiscuo per pedoni e ciclisti.",
    "answer": "Falsa"
  },
  {
    "description": "Cerchio blu con numero 30 in bianco sbarrato da una linea diagonale rossa",
    "sign": "Fine del limite minimo di velocità",
    "question": "Il segnale indica che è vietato circolare a velocità superiori a 30 km/h.",
    "answer": "Falsa"
  },
  {
    "description": "Cerchio blu con tre frecce bianche ricurve che formano un cerchio in senso antiorario",
    "sign": "Rotatoria",
    "question": "Il segnale indica la presenza di un'intersezione nella quale la circolazione è regolata a rotatoria.",
    "answer": "Vera"
  },
  {
    "description": "Ottagono rosso con bordo bianco e scritta STOP in lettere bianche al centro",
    "sign": "Fermarsi e dare precedenza",
    "question": "Il segnale obbliga a fermarsi e dare la precedenza anche se non sopraggiungono altri veicoli.",
    "answer": "Vera"
  },
  {
    "description": "Triangolo bianco capovolto con bordo rosso",
    "sign": "Dare precedenza",
    "question": "Il segnale impone l'obbligo di arresto immediato del veicolo in ogni caso.",
    "answer": "Falsa"
  },
  {
    "description": "Cerchio rosso con bordo bianco, contenente una freccia rossa rivolta verso l'alto e una freccia nera rivolta verso il basso",
    "sign": "Precedenza nei sensi unici alternati",
    "question": "Il segnale indica che si ha la precedenza rispetto ai veicoli provenienti dal senso opposto.",
    "answer": "Falsa"
  },
  {
    "description": "Rettangolo blu con una linea verticale bianca sormontata da un segmento orizzontale rosso",
    "sign": "Strada senza uscita",
    "question": "Il segnale indica che la strada è chiusa al transito dei soli veicoli a motore.",
    "answer": "Falsa"
  },
  {
    "description": "Rettangolo verde con il disegno bianco di un cavalcavia che scavalca una strada a due carreggiate separate",
    "sign": "Inizio autostrada",
    "question": "Il segnale è posto all'inizio di una strada extraurbana principale.",
    "answer": "Falsa"
  },
  {
    "description": "Rettangolo blu contenente una lettera P bianca di grandi dimensioni",
    "sign": "Parcheggio",
    "question": "Il segnale indica una zona autorizzata per la sosta dei veicoli per un tempo indeterminato, salvo diversa indicazione.",
    "answer": "Vera"
  },
  {
    "description": "Cerchio blu con freccia bianca obliqua verso il basso a destra",
    "sign": "Passaggio obbligatorio a destra",
    "question": "Il segnale indica obbligo di passare a destra di un cantiere stradale",
    "answer": "Vera"
  },
  {
    "description": "Cerchio bianco con sbarra nera diagonale al centro",
    "sign": "Via libera",
    "question": "Il segnale indica la fine di un cantiere di lavoro",
    "answer": "Falsa"
  }
];

// ── LLM Helpers ──

async function callLLMWithImage(question: string, context: string, lang: string, imageBase64: string): Promise<string> {
  const fewShotText = FEW_SHOT_EXAMPLES.map(ex =>
    `Esempio: Segnale "${ex.description}" → ${ex.sign}. Domanda: "${ex.question}" → ${ex.answer}.`
  ).join("\n");

  const prompt = `Sei un istruttore di scuola guida. Analizza l'immagine e rispondi alla domanda Vero/Falso.

Regole:
1. Se l'immagine mostra un segnale stradale, identificalo (categoria + obblighi specifici)
2. Se l'immagine NON è un segnale stradale (es. persona, incidente, situazione), NON dire "l'immagine non è un segnale". Rispondi direttamente alla domanda basandoti sul contesto
3. NON descrivere il segnale visivamente (niente "cerchio blu con freccia")
4. Basati sul contesto del manuale
5. Rispondi in MASSIMO 2 frasi
6. Termina con "Per questo la domanda è Vera." o "Per questo la domanda è Falsa."

Esempi:
${fewShotText}

Contesto dal manuale:
${context}

Domanda (Vero/Falso): ${question}

Rispondi in ${lang}.`;

  const systemPrompt = `Rispondi sempre in ${lang}. NON menzionare il tuo nome o che sei un'AI. Inizia direttamente con la spiegazione.`;

  if (LLM_PROVIDER === "gemini") {
    return callGeminiWithImage(systemPrompt, prompt, imageBase64);
  }
  return callLMStudioWithImage(systemPrompt, prompt, imageBase64);
}

async function callLLM(prompt: string, langName: string): Promise<string> {
  const systemPrompt = `Sei un istruttore di scuola guida. Rispondi sempre in ${langName}. NON menzionare il tuo nome o che sei un'AI. Inizia direttamente con la spiegazione.`;

  if (LLM_PROVIDER === "gemini") {
    return callGemini(systemPrompt, [{ role: "user", content: prompt }]);
  }
  return callLMStudio(systemPrompt, [{ role: "user", content: prompt }]);
}

// ── Gemini ──

// The Gemini free tier intermittently answers 429/503 ("high demand",
// "quota exceeded"). Those are transient, so retry with backoff before
// giving up; only a 4xx (other than 429) is a real configuration error.
const GEMINI_MAX_ATTEMPTS = 4;
const GEMINI_RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

async function geminiFetch(url: string, body: string): Promise<Response> {
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
      lastRes = res;
      lastErr = await res.text();
      if (!GEMINI_RETRYABLE_STATUS.has(res.status) || attempt === GEMINI_MAX_ATTEMPTS) break;
      const waitMs = 800 * 2 ** (attempt - 1);
      console.warn(`Gemini ${res.status} (attempt ${attempt}/${GEMINI_MAX_ATTEMPTS}), retry in ${waitMs}ms`);
      await new Promise((r) => setTimeout(r, waitMs));
    } catch (e) {
      lastErr = String(e);
      if (attempt === GEMINI_MAX_ATTEMPTS) break;
      await new Promise((r) => setTimeout(r, 800 * 2 ** (attempt - 1)));
    }
  }
  const status = lastRes ? lastRes.status : 0;
  console.error(`Gemini error [${status}]: ${lastErr}`);
  throw new Error(`Gemini API unavailable (HTTP ${status}): ${lastErr.slice(0, 300)}`);
}

// Gemma/Flash may return reasoning parts flagged `thought: true`; the actual
// answer is the last non-thought part, so never read parts[0] blindly.
function extractGeminiText(data: any): string {
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

// manual_chunks rows are tagged with the *base* category id only; the "hard"
// twin of a category (same sort_order, is_hard=true) has no chunks of its own.
// Map hard -> base so the category filter stays meaningful for the ~600
// questions that live in a hard sign category.
async function resolveChunkCategory(supabase: any, categoryId: string): Promise<string> {
  const { data } = await supabase
    .from("categories").select("sort_order, is_hard").eq("id", categoryId).maybeSingle();
  if (!data?.is_hard) return categoryId;
  const { data: base } = await supabase
    .from("categories").select("id")
    .eq("sort_order", data.sort_order).eq("is_hard", false).maybeSingle();
  return base?.id ?? categoryId;
}

async function geminiComplete(systemPrompt: string, bodyFor: (maxTokens: number) => string): Promise<string> {
  const budgets = [GEMINI_TOKENS_DEFAULT, GEMINI_TOKENS_RETRY];
  let lastReason = "UNKNOWN";
  for (let i = 0; i < budgets.length; i++) {
    const res = await geminiFetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      bodyFor(budgets[i])
    );
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

async function callGemini(systemPrompt: string, messages: { role: string; content: string }[]): Promise<string> {
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

async function callGeminiWithImage(systemPrompt: string, prompt: string, imageBase64: string): Promise<string> {
  // Extract MIME type and raw base64
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

// ── LM Studio ──

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
    }),
  });

  if (!res.ok) throw new Error("LLM service unavailable");
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

async function callLMStudioWithImage(systemPrompt: string, prompt: string, imageBase64: string): Promise<string> {
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
    }),
  });

  if (!res.ok) throw new Error("LLM service unavailable");
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

// ── Embedding ──

async function generateTextEmbedding(text: string): Promise<number[]> {
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
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Embedding failed: ${res.status} ${err}`);
  }
  const data = await res.json();
  return data.data[0].embedding;
}

// ── Helper ──

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
