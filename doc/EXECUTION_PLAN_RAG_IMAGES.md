# EXECUTION PLAN — RAG con immagini (DEV)

> Ambiente: DEV `mvkxafzywzuohnbqjqmo` · LM Studio `:1234` (non più usato in 2c)
> Obiettivo: migliorare la retrieval RAG per le domande la cui risposta dipende dall'immagine (segnali stradali).
> Regola: tutto su DEV; promozione PROD solo a fine validazione.
> **Ultimo aggiornamento: 2026-09-26 — Fasi 2c e 2d COMPLETATE.** Dump PROD→DEV fatto (DEV = PROD: 1.373 immagini).
> La classificazione dei segnali è stata **rifatta interamente con analisi visiva (non qwen)**: 1.373/1.373 immagini,
> 352 etichette cambiate, QA manuale su 226 cambi + 135 low-confidence.
> Retrieval ibrida **deployata su DEV** + prima valutazione DEV↔PROD eseguita (vedi Fase 2d e Chiusura).

## Stato

| Fase | Stato | Note |
|------|-------|------|
| 0 — Fondamenta | ✅ | `vector(1024)`→`vector(768)` applicata su DEV |
| 1 — Category filter | ✅ | deployato su DEV; test: top-3 solo cap-04 con filtro |
| 2a — Migration schema | ✅ | `image_sign_type` + `sign_to_chunk` + RPC verificate su DEV |
| 2b — populate sign_to_chunk | ✅ | 79/79 righe (48 exact + 13 alias + 18 partial), RPC Path A OK |
| 2c — batch identify signs | ✅ **COMPLETATA** | dump PROD→DEV ok (1.373 img). qwen: 2 run (53 min + 8 min) poi **sostituito da classificazione visiva** (subagenti) su tutte le 1.373. Esito: 416 con segnale / 957 NON_IDENTIFICATO, 0 NULL |
| 2d — retrieval ibrida | ✅ **COMPLETATA** | Path A sign-pinned + fallback cosine; 3 bug trovati e fixati (vedi sotto); valutazione 20 domande DEV↔PROD |
| 4 — chat contestualizzata | ⬜ | `_shared/` + payload + UI |
| C — Chiusura | 🔄 parziale | C.1 primo giro fatto; manca evaluation estesa + docs + checklist PROD |


---

## Vincoli e decisioni consolidati (leggere prima di toccare qualcosa)

> La sospensione del 2026-09-24 (dump PROD→DEV) è chiusa: il dump è stato fatto, DEV == PROD
> (1.373 immagini, 8.970 domande, 17.940 traduzioni, spiegazioni cache tutte NULL).

| Decisione | Esito | Motivo |
|---|---|---|
| Modello per classificazione immagini | **analisi visiva via subagenti** (qwen abbandonato) | qwen aveva 3 errori sistematici (dosso/cunetta, sosta/fermata, bias dx/sx); il secondo pass mirato peggiorava sosta/fermata |
| Formato output classificazione | **ID numerico 0..79** (0 = NON_IDENTIFICATO) | elimina hallucination: il modello non può inventare nomi fuori dal catalogo |
| Trasporto DB | **`npx supabase db query --linked --file ... --output-format json`** con retry | la vecchia `service_role` JWT è disabilitata dal 2026-08-17; la Management API maschera i `sb_secret_` |
| Storage immagini | DEV: `easypatente` privato + policy `20260924170000`. PROD: `easyPatenteProd` privato → sign API con secret key PROD (`quizConverter/.env`) | verificato |
| Journal/flush | JSONL append-only + flush ogni 50 file, risumibile | crash-safe |
| Promozione PROD | **solo dopo validazione utente**, join per `code`/`image_filename` (gli UUID sono diversi fra DEV e PROD) | pipeline usa `uuid.uuid4()` random a ogni run |

### Modello LLM di produzione (scelta utente, 2026-09-26)

- **Inizialmente `gemma-4-26b-a4b-it`** (oppure `gemma-4-31b-it`), per l'alto rate limit.
  ⚠️ Su questa API sono disponibili **solo** questi due (`gemma-3-31b-it` non esiste; gemma-3 arriva a 27b).
- `gemini-flash-latest` / `3.8-flash` / `3.5-flash` sono in **quota esaurita o 503 overload** → non usabili.
- **I modelli gemma sono reasoning e il pensiero NON si può spegnere** (`thinkingBudget` / `thinkingLevel` /
  `reasoningEffort` rifiutati dall'API). Rischio: loop di ragionamento che consuma tutto il budget di output
  → risposta vuota. Mitigazioni già in `explain-question/index.ts`:
  - `extractGeminiText` legge **solo** le parti non-`thought` (niente ripiego sul monologo);
  - `geminiComplete` ritenta con `maxOutputTokens=16384` se la risposta è vuota;
  - una spiegazione vuota **non viene mai salvata in cache** (502 invece di cache avvelenata).
- Chiave Gemini **condivisa DEV/PROD** → la quota è un vincolo comune (osservati 429 durante la valutazione).

## Fase 0 — Fondamenta ✅
- [x] 0.1 Conferma link DEV: `cat supabase/.temp/project-ref` → `mvkxafzywzuohnbqjqmo`
- [x] 0.2 Verifica dimensione `questions.embedding` → era `vector(1024)` vs runtime 768
- [x] 0.3 Migration `20260924160000_fix_questions_embedding_dim` + push su DEV → `vector(768)`
- [x] 0.4 Test RPC `match_manual_chunks` con embedding noto → chunk plausibili (fallback cosine OK)

## Fase 1 — Category-filtered retrieval ✅
- [x] 1.1 `explain-question/index.ts`: `category_id` nella select (riga ~133), set `SIGN_CATEGORY_IDS` (18 UUID categorie segnaletica, righe 31-50), `filter_category_id` passato a `match_manual_chunks`
- [x] 1.2 Deploy DEV + test SQL: filtro Divieto → top-3 tutti `cap-04` (PARCHEGGIO/SOSTA) ✅
- Nota: il filtro vale solo per la fase di **generazione** (cache miss); le spiegazioni già cache in it non lo usano.

## Fase 2a — Schema + RPC ✅
- [x] 2a.1 Migration `20260924160100_add_sign_retrieval`: `questions.image_sign_type` (+indice parziale), tabella `sign_to_chunk` (PK `sign_name`, RLS SELECT authenticated), RPC `match_chunks_by_sign(p_sign_name, p_query_embedding, p_match_count, p_filter_language)` (Path A strutturato / Path B cosine fallback)
- [x] 2a.2 Push su DEV → verificato `column=1, table=1, rpc=1`

## Fase 2b — Mappa segnali → chunk ✅
- [x] 2b.1 Script `populate_sign_to_chunk.py` fixato: match parziale solo se `len(section)>=3` (elimina il bug della sezione `A` che matchava 11 falsi positivi), dict `ALIASES` con 13 casi (OCR `SALITA RPIDA`, `ALT-POLIZIA`, wording diverso…), dedup PK, `--dry-run`
- [x] 2b.2 Migration `20260924160200_populate_sign_to_chunk` (79 INSERT ON CONFLICT) + push → **79/79 righe**, 0 chunk dangling
- [x] 2b.3 Test RPC: `match_chunks_by_sign('Divieto di sosta', NULL, 3, 'it')` → chunk esatto `v1/cap-04/sez-33/001`, similarity 1

## Fase 2c — Batch identificazione ✅ COMPLETATA
- [x] 2c.0 Ricerca vincoli: legacy key disabilitata, gemma in loop thinking → soluzioni sopra
- [x] 2c.1 Script `ragPipeline/batch_identify_signs.py` **riscritto**: prompt a ID numerico, modello `qwen/qwen3-vl-30b` (env `LLM_MODEL`), trasporto `db query` (nessuna secret key), dedup filename, journal JSONL + flush ogni 50, resume, `--limit`/`--flush-every`
- [x] 2c.2 Validazione modello: 6/6 su test (clacson→26, bici→78, camion→29, pedone→77, camper→0, città→0), 1.9s/media
- [x] 2c.3 Smoke test `--limit 3` end-to-end → 3/3 + flush DB verificato (vedi sopra, dati da azzerare)
- [x] 2c.4 Run completo qwen (`qwen/qwen3-vl-30b`): 1.373/1.373, 52,7 min, 2,3 s/file, 0 falliti
- [x] 2c.5 QA → **3 errori sistematici trovati in qwen** (dosso/cunetta, sosta/fermata, direzione dx/sx). Second pass mirato: 98 cambi, ma su sosta/fermata peggiorava (mia hint sul glifo fermata era falsa: fermata = **X**, non diagonale+verticale)
- [x] 2c.6 **Riclassifica 1.373/1.373 con analisi visiva** (subagenti, 55 batch da 25). Regole ancorate ai glifi ufficiali scaricati da Wikimedia (sosta=1 barra, fermata=X, direzione obbl.=freccia orizzontale, passaggio obbl.=freccia diagonale in basso)
- [x] 2c.7 QA manuale: 135 low-confidence + 226 cambi rivisti → 46 + 25 correzioni. Totale **352 etichette cambiate** vs qwen
- [x] 2c.8 Scrittura DB (solo `image_sign_type`), journal aggiornato, backup in `labels_before_vision.json` / `sign_journal.jsonl`

## Fase 2d — Retrieval ibrida edge function ✅ COMPLETATA
- [x] 2d.1 `explain-question`: se `image_sign_type` NON NULL/non `NON_IDENTIFICATO` **e** la domanda è in categoria segnaletica (gate `SIGN_CATEGORY_IDS` — protegge da casi come image16 "autostrada" dove il modello forzava un nome) → `match_chunks_by_sign` (Path A, con `p_sign_name`/`p_query_embedding`/`p_match_count`/`p_filter_language`); altrimenti fallback cosine + `filter_category_id`
- [x] 2d.1b Prompt sign-aware: `L'immagine mostra il segnale stradale "X"` iniettato in `signAwarePrompt`; payload espone `retrieval_path` + `identified_sign` (anche in risposta **da cache**)
- [x] 2d.2 Deploy DEV + test battery 10 domande trappola → 5 sign-path, 5 cosine, verdetto corretto in tutti
- Nota: le immagini "scena/veicolo" (piazza, camper) restituiscono `NON_IDENTIFICATO` → retrieval normale.

### Bug trovati e fixati durante 2d

| # | Bug | Effetto | Fix |
|---|---|---|---|
| 1 | `extractGeminiText` leggeva `parts[0]` | con un modello reasoning il **monologo interno** diventava la spiegazione e finiva in cache | legge solo le parti non-`thought` |
| 2 | Budget di output 4096 fisso | loop di ragionamento → `MAX_TOKENS` → **"Empty response from LLM"** | `geminiComplete` ritenta con 16384; spiegazione vuota **mai** salvata in cache (502) |
| 3 | **Tutte le 9 categorie "hard" segnaletiche hanno 0 chunk** in `manual_chunks` (600 domande) | con `image_sign_type=NON_IDENTIFICATO` il filtro categoria tornava vuoto → `404 No relevant context found` | `resolveChunkCategory` mappa hard→base via `sort_order` (appaiamento 1:1 verificato) + ritentativo **senza filtro** se ancora 0 righe |
| 4 | Risposta **da cache** senza `retrieval_path`/`identified_sign` | nessuna osservabilità sui cache hit | i due campi sono tornati nel payload cache |

### Modello in uso su DEV (2026-09-26)

`GEMINI_MODEL=gemini-flash-lite-latest` (nessun ragionamento, immagini ok, 2-8 s). Le **chiavi e i secret DEV/PROD sono separati**;
la chiave Gemini invece è la stessa per entrambi → quota condivisa (429 osservati durante la valutazione).

## Fase 4 — Chat contestualizzata + immagine
- [ ] 4.1 Estrai moduli condivisi `_shared/` (cors, fetchImage, callLLMWithImage, embedding)
- [ ] 4.2 `chat/index.ts`: accetta `question_id`/`image_filename`, retrieval come explain, VL se immagine
- [ ] 4.3 Client: `sendMessage` + contesto, `handleAskAIChat` passa `questionId`+`imageFilename`, thumbnail in UI chat
- [ ] 4.4 Deploy DEV + test flusso quiz→chat con immagine

## Chiusura
- [x] C.1a **Primo giro di valutazione DEV↔PROD** (20 domande, 3 gruppi, script `eval_dev_prod.py`):
      - Gruppo **A** (10 domande segnaletiche con segnale identificato → Path A): **DEV 7/10 vs PROD 6/10**
      - Gruppo **B** (5 segnaletiche `NON_IDENTIFICATO` → cosine): DEV 5/5 vs PROD 5/5 (2 errori iniziali, fixati con il bug #3)
      - Gruppo **C** (5 non-segnaletiche → cosine): DEV 2/3 risposte corrette (2 errori da quota 429) vs PROD 4/5
      - Totale: **DEV 14/20 vs PROD 15/20** — campione piccolo, latenza DEV 7,9 s vs PROD 0,6 s (PROD da cache)
      - Metrica: confronto del verdetto finale (`Vera`/`Falsa`) con `questions.is_correct` (4.670 F / 4.300 V)
- [ ] C.1b **Evaluation estesa**: 50-100 domande per gruppo, escludere i 429, misurare hit-rate del chunk recuperato
      (non solo il verdetto) e confrontare i contesti prima/dopo
- [ ] C.1c **Test con i modelli gemma di produzione** (`gemma-4-26b-a4b-it` / `gemma-4-31b-it`): tasso di risposta vuota,
      latenza, qualità su ~15 domande — da fare **prima** della promozione
- [ ] C.2 Aggiorna `doc/PROJECT.md` (sezione `explain-question`) + `doc/APP_STRUCTURE.md`
- [ ] C.3 Checklist promozione PROD (migrations 0/1/2a/2b + edge functions + propagatione `image_sign_type` **per `code`/`image_filename`** — solo dopo OK utente)

---

## Riferimenti rapidi

- **Migrations create**: `20260924160000_fix_questions_embedding_dim`, `20260924160100_add_sign_retrieval`, `20260924160200_populate_sign_to_chunk` (tutte su DEV)
- **Edge function modificata**: `supabase/functions/explain-question/index.ts` (deployata su DEV)
- **Script**: `ragPipeline/batch_identify_signs.py` (riscritto), `ragPipeline/signImageMatcher/populate_sign_to_chunk.py` (fixato)
- **Journal smoke**: `/var/folders/nh/fkkdkk391j3b65tr139vpld40000gn/T/opencode/sign_journal.jsonl` (cancellare)
- **Key PROD**: `supabase/functions/.env.production` → `SUPABASE_URL`/`SUPABASE_SECRET_KEYS`; **key DEV**: `/var/folders/nh/fkkdkk391j3b65tr139vpld40000gn/T/opencode/dev_secret.env` (chmod 600)
- **Valutazione**: `/var/folders/nh/fkkdkk391j3b65tr139vpld40000gn/T/opencode/eval_dev_prod.py` + `eval_{A,B,C}.json` + `eval_results.json`
- **DB via**: `npx supabase db query --linked --file <f> --output-format json` (usare `--file`, gli UUID vanno **quotati**)
- **Test immagini**: nomi + domande mostrano che stessi CODE hanno contenuti coerenti; visuale agent su file scaricati con `Read`
