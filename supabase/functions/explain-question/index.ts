import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { corsHeaders, json } from "../_shared/cors.ts";
import { LANG_NAMES, SUPABASE_STORAGE_URL } from "../_shared/env.ts";
import { generateEmbedding } from "../_shared/embedding.ts";
import { runLLM, runLLMWithImage } from "../_shared/llm.ts";
import { SIGN_CATEGORY_IDS, buildContext, retrieveChunks } from "../_shared/retrieval.ts";

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
    const wantsSecondary = (sourceExplanation: string) =>
      secondary_lang && secondary_lang !== lang_code
        ? resolveSecondaryExplanation(supabase, question_id, secondary_lang, sourceExplanation)
        : Promise.resolve(null);

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
        .from("questions").select("image_sign_type, category_id, image_filename")
        .eq("id", question_id).single();
      const cachedSign = cachedQuestion?.image_sign_type &&
        cachedQuestion.image_sign_type !== "NON_IDENTIFICATO"
        ? cachedQuestion.image_sign_type : null;
      const cachedIsSignQuestion = !!cachedQuestion?.category_id &&
        SIGN_CATEGORY_IDS.has(cachedQuestion.category_id);
      const cachedPath = cachedIsSignQuestion && cachedSign ? "sign" : "cosine";
      const cacheMeta = {
        retrieval_path: cachedPath, identified_sign: cachedSign,
        has_image: !!cachedQuestion?.image_filename, reranked: false,
      };
      // If target language is Italian, return directly
      if (lang_code === "it") {
        const secondaryExplanation = await wantsSecondary(italianExplanation);
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
      const secondaryExplanation = await wantsSecondary(italianExplanation);

      return json({ explanation: targetExplanation, secondary_explanation: secondaryExplanation, sources: null, from_cache: true, ...cacheMeta });
    }

    // ── 3. No explanation exists: generate it in Italian first ──
    const { data: question } = await supabase
      .from("questions").select("id, code, embedding, image_filename, category_id, image_sign_type")
      .eq("id", question_id).single();
    if (!question) return json({ error: "Question not found" }, 404);

    // Fetch image. The bucket is private so this fetch fails (400) unless we
    // add credentials: we deliberately do NOT, because the model must answer
    // from the manual + sign metadata only, never from pixels.
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
      embedding = await generateEmbedding(textToEmbed);
      await supabase.from("questions").update({ embedding }).eq("id", question_id);
    }

    // Hybrid retrieval condivisa (sign-aware -> cosine), vedi _shared/retrieval.ts
    const retrieval = await retrieveChunks(supabase, {
      embedding,
      categoryId: question.category_id,
      imageSignType: question.image_sign_type,
      questionText: question_text || italianTranslation?.text || question.code,
    });
    const { chunks, retrievalPath, identifiedSign, useSignPath, reranked } = retrieval;

    if (chunks.length === 0) return json({ error: "No relevant context found" }, 404);

    const contextText = buildContext(chunks);

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
      const secondaryExplanation = await wantsSecondary(generatedExplanation);
      return json({
        explanation: generatedExplanation, secondary_explanation: secondaryExplanation, sources: null,
        from_cache: false, has_image: !!imageBase64,
        retrieval_path: retrievalPath, identified_sign: identifiedSign, reranked,
        sections: chunks.map((c: any) => c.section),
      });
    }

    // Translate to target language
    const targetLangName = LANG_NAMES[lang_code] || lang_code;
    const targetExplanation = await callLLM(`Traduci in ${targetLangName}. Restituisci SOLO la traduzione, senza aggiungere testo introduttivo o spiegazioni:\n\n${generatedExplanation}`, targetLangName);
    await supabase.from("question_translations").update({ explanation: targetExplanation })
      .eq("question_id", question_id).eq("lang_code", lang_code);

    // Handle secondary language
    const secondaryExplanation = await wantsSecondary(generatedExplanation);

    const sources = chunks.map((c: any) => ({
      chapter: c.chapter, section: c.section, page_start: c.page_start,
      page_end: c.page_end, article_ref: c.article_ref, keywords: c.keywords,
    }));

    return json({
      explanation: targetExplanation, secondary_explanation: secondaryExplanation, sources,
      has_image: !!imageBase64, from_cache: false,
      retrieval_path: retrievalPath, identified_sign: identifiedSign, reranked,
      sections: chunks.map((c: any) => c.section),
    });
  } catch (error) {
    console.error("Error:", error);
    return json({ error: (error as Error)?.message || "Internal error" }, 500);
  }
});

// ── Prompts ──

/**
 * Spiegazione nella lingua secondaria: usa la cache `question_translations`,
 * altrimenti traduce da `sourceExplanation` (sempre l'italiano) e salva.
 */
async function resolveSecondaryExplanation(
  supabase: any,
  questionId: string,
  secondaryLang: string,
  sourceExplanation: string,
): Promise<string> {
  const { data: sec } = await supabase
    .from("question_translations").select("explanation")
    .eq("question_id", questionId).eq("lang_code", secondaryLang).maybeSingle();
  if (sec?.explanation) return sec.explanation;

  const secLangName = LANG_NAMES[secondaryLang] || secondaryLang;
  const translated = await callLLM(`Traduci in ${secLangName}. Restituisci SOLO la traduzione, senza aggiungere testo introduttivo o spiegazioni:\n\n${sourceExplanation}`, secLangName);
  await supabase.from("question_translations").update({ explanation: translated })
    .eq("question_id", questionId).eq("lang_code", secondaryLang);
  return translated;
}

function textPrompt(question: string, context: string, lang: string): string {
  return `Scrivi la spiegazione come la scriverebbe il manuale di teoria: tono didattico, asseritivo, in prima persona del manuale.

Regole di stile:
1. Prima frase = la regola: cosa dice la norma o cosa significa il segnale ("Il segnale X preavvisa che ...", "Secondo l'art. Y ...").
2. Seconda frase = un dato CONCRETO che aggiunga qualcosa: dove si applica, quando, l'eccezione, il limite, la conseguenza per chi guida. NON una frase che si limiti a dire che la risposta combacia.
3. Vietate le frasi di riserva che non spiegano nulla: "L'affermazione corrisponde a quanto previsto dal segnale", "Tale prescrizione corrisponde alla funzione del segnale", "Quanto indicato è corretto", "È coerente con la normativa", "La risposta è vera perché ...".
4. NON citare la fonte. Vietati: "il contesto", "il testo", "quanto riportato", "come indicato", "dal manuale risulta", "la domanda afferma", "la risposta fornita", "coerente con", "conferma che". Il lettore non deve mai capire che esiste un contesto.
5. Niente preamboli ("La domanda chiede ...", "Analizzando ..."). Inizia subito dalla regola.
6. MASSIMO 3 frasi.
7. Termina SEMPRE con "Per questo la domanda è Vera." oppure "Per questo la domanda è Falsa."

Esempi di stile:
Domanda: "Il segnale si trova nei pressi di scuole o giardini pubblici frequentati da fanciulli."
Risposta: Il segnale "Bambini" preavvisa la presenza di luoghi frequentati dai bambini, come scuole e asili. Prima del luogo segnalato occorre ridurre la velocità e essere pronti a fermarsi, perché i bambini possono attraversare la strada all'improvviso. Per questo la domanda è Vera.

Domanda: "Il segnale impone il divieto di transito ai veicoli trainati da animali."
Risposta: Il segnale "Animali selvatici vaganti" preavvisa la presenza di animali che possono attraversare la strada. Non si tratta di un divieto: impone solo di ridurre la velocità e di non fermarsi in prossimità del luogo segnalato. Per questo la domanda è Falsa.

Contesto dal manuale (solo per te: usarlo come fonte, non citarlo né menzionarlo):
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

// ── Prompt builders (spiegazione) ──

function callLLMWithImage(question: string, context: string, lang: string, imageBase64: string): Promise<string> {
  const fewShotText = FEW_SHOT_EXAMPLES.map(ex =>
    `Esempio: Segnale "${ex.description}" → ${ex.sign}. Domanda: "${ex.question}" → ${ex.answer}.`
  ).join("\n");

  const prompt = `Sei un manuale di teoria della patente. Analizza l'immagine e rispondi alla domanda Vero/Falso con tono didattico e asseritivo.

Regole:
1. Se l'immagine mostra un segnale stradale, identificalo (categoria + obblighi specifici)
2. Se l'immagine NON è un segnale stradale (es. persona, incidente, situazione), NON dire "l'immagine non è un segnale". Rispondi direttamente alla domanda
3. NON descrivere il segnale visivamente (niente "cerchio blu con freccia")
4. Enuncia prima la regola (cosa dice la norma o cosa significa il segnale); la seconda frase deve aggiungere un dato concreto (dove si applica, quando, l'eccezione, il limite, la conseguenza per chi guida), mai una frase che si limiti di dire che la risposta combacia
5. NON citare la fonte del ragionamento e NON usare frasi di riserva: vietati "il contesto", "il testo", "quanto riportato", "come indicato", "dal manuale risulta", "la domanda afferma", "coerente con", "conferma che", "L'affermazione corrisponde a quanto previsto", "Quanto indicato è corretto". Il lettore non deve capire che esiste un contesto
6. MASSIMO 3 frasi, senza preamboli
7. Termina con "Per questo la domanda è Vera." o "Per questo la domanda è Falsa."

Esempi:
${fewShotText}

Contesto dal manuale (solo per te: usarlo come fonte, non citarlo):
${context}

Domanda (Vero/Falso): ${question}

Rispondi in ${lang}.`;

  const systemPrompt = `Rispondi sempre in ${lang}. NON menzionare il tuo nome o che sei un'AI. Inizia direttamente con la spiegazione.`;
  return runLLMWithImage(systemPrompt, prompt, imageBase64);
}

function callLLM(prompt: string, langName: string): Promise<string> {
  const systemPrompt = `Sei il manuale di teoria della patente: rispondi con il tono asseritivo e didattico del manuale stesso. Rispondi sempre in ${langName}. NON menzionare il tuo nome o che sei un'AI. NON riferirti mai al contesto, al testo o alla fonte da cui ricavi l'informazione. Inizia direttamente con la regola.`;
  return runLLM(systemPrompt, [{ role: "user", content: prompt }]);
}
