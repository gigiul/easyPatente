# EXECUTION PLAN — RAG con immagini (DEV)

> Ambiente: DEV `mvkxafzywzuohnbqjqmo` · LM Studio `:1234` (non più usato in 2c)
> Obiettivo: migliorare la retrieval RAG per le domande la cui risposta dipende dall'immagine (segnali stradali).
> Regola: tutto su DEV; promozione PROD solo a fine validazione.
> **Ultimo aggiornamento: 2026-09-28 — Fasi 2c, 2d, 3 e 4 COMPLETATE.** Dump PROD→DEV fatto (DEV = PROD: 1.373 immagini).
> La classificazione dei segnali è stata **rifatta interamente con analisi visiva (non qwen)**: 1.373/1.373 immagini,
> 352 etichette cambiate, QA manuale su 226 cambi + 135 low-confidence.
> Retrieval ibrida **deployata su DEV**; in più (fase 3): **re-rank LLM** su Path B, **vocabolario allineato**
> (`sign_to_chunk` 79 → **204 righe**) e **classificazione visiva completa delle 271 immagini `NON_IDENTIFICATO`**
> (3.832/4.110 domande segnaletiche ora hanno un segnale identificato; restano 278).
> Chat contestualizzata (Fase 4) deployata e testata su DEV.

## Stato

| Fase | Stato | Note |
|------|-------|------|
| 0 — Fondamenta | ✅ | `vector(1024)`→`vector(768)` applicata su DEV |
| 1 — Category filter | ✅ | deployato su DEV; test: top-3 solo cap-04 con filtro |
| 2a — Migration schema | ✅ | `image_sign_type` + `sign_to_chunk` + RPC verificate su DEV |
| 2b — populate sign_to_chunk | ✅ | 79/79 righe (48 exact + 13 alias + 18 partial), RPC Path A OK → **204** dopo fase 3 |
| 2c — batch identify signs | ✅ **COMPLETATA** | dump PROD→DEV ok (1.373 img). qwen: 2 run (53 min + 8 min) poi **sostituito da classificazione visiva** (subagenti) su tutte le 1.373. Esito: 416 con segnale / 957 NON_IDENTIFICATO, 0 NULL |
| 2d — retrieval ibrida | ✅ **COMPLETATA** | Path A sign-pinned + fallback cosine; 3 bug trovati e fixati (vedi sotto); valutazione 20 domande DEV↔PROD |
| 3 — Miglioramenti retrieval | ✅ **COMPLETATA** | opzione 1 (vision pass su 271 immagini) + opzione 3 (re-rank) + opzione 4 (vocabolario). **Opzione 2 (immagine al LLM) rifiutata dall'utente** |
| 4 — chat contestualizzata | ✅ **COMPLETATA** | `_shared/` + `question_id` + test end-to-end su DEV |
| C — Chiusura | 🔄 parziale | C.1 primo giro fatto; docs `PROJECT.md` aggiornate; manca evaluation estesa + checklist PROD |


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

## Fase 3 — Miglioramenti retrieval (2026-09-28) ✅ COMPLETATA

Quattro opzioni valutate; **opzione 2 (inviare l'immagine al LLM) rifiutata dall'utente** → fetch immagine
lasciato deliberatamente senza header auth (fallisce 400) e commentato in `explain-question`.

- [x] **3.1 Opzione 3 — re-rank LLM (Path B)**: `rerankByQuestion` in `_shared/retrieval.ts`; domanda +
      frammenti numerati → modello risponde solo il numero del frammento pertinente (`gemini-flash-lite-latest`,
      `GEMINI_RERANK_MODEL`); reorder best-effort (scelto per primo), flag `reranked` nel payload.
      Attivo **solo** su domande segnaletiche con Path B (Path A è già pinato sul segnale).
      Verificato su `Q_MANDATORYSIGNS_8`: il chunk corretto (frecce direzionali) era rango 4 → ora primo.
- [x] **3.2 Opzione 4 — allineamento vocabolario `sign_to_chunk`**: 79 → **204 righe**. Aggiunte per:
      (a) nomi mancanti usati nelle domande (`Direzioni consentite …`, `Fine centro abitato`, `Doppia striscia
      continua`, `Tratti alternati gialli e neri`, …) e (b) **121 nomi proposti dal vision pass**, ciascuno
      mappato sul chunk del manuale (96 `high` + 18 `medium`, 7 scartati perché senza sezione dedicata:
      `Pannello informativo per passi di montagna`, `Rallentatore di velocità`, `Segnaletica di direzione`,
      `Preavviso di uscita`, `Parcheggio per autocarri`, `Pannello integrativo: autocarro`,
      `Possibilità di collisione`, più `Nome del fiume` e `Trasporto di autovetture su treno` scartati a mano).
- [x] **3.3 Opzione 1 — vision pass sulle 271 immagini `NON_IDENTIFICATO`**: classificazione **fatta
      dall'agente** (non da un LLM locale, per scelta esplicita dell'utente), in 8 slice da ~31 immagini
      (subagenti in parallelo). Ogni immagine è stata **etichettata in-pixel** (nome file stampato
      sull'immagine) perché il tool di lettura restituiva file scambiati/obsoleti; le domande associate
      (`text` + `is_correct`) sono usate come conferma/ground-truth.
      Esito: **271/271 immagini** → 66 con nome dal vocabolario, **157 con nome nuovo** (mappato in 3.2),
      **48 `NON_IDENTIFICATO`** (foto, tavole A/B/C, placeholder).
      Scritture DB: `questions.image_sign_type` aggiornato su **1.214 domande** (265 + 949).
      Stato finale: **3.832/4.110** domande segnaletiche con segnale identificato (prima 2.275), 278 `NON_IDENTIFICATO`.
      Verifica end-to-end su 17 domande → **17/17 verdetto corretto, tutte `retrieval_path: "sign"`**.

## Fase 5 — Spiegazioni precompilate per le figure di precedenza (2026-09-28) ✅ COMPLETATA

Le domande con figura (GIF animate) non sono segnaletiche → niente Path A, e il modello **non vede
l'immagine** (scelta 2 rifiutata): la spiegazione era generata **al volo e inventava la scena** (30-150 s,
has_image=false, 0 hit di cache). Soluzione: **precompilazione offline** della cache, senza LLM e senza
modello locale — l'analisi visiva è fatta dall'agente.

- [x] 5.1 Dati: categoria "Precedenze" base (`2ee255f6-…62dd`) + difficile (`d1000009-…0009`) =
      **510 domande su 85 sole immagini** (73 GIF 480×340 ~70 frame + 12 JPG), tutte presenti in
      `quizConverter/extracted_images/<category_uuid>/`
- [x] 5.2 Estrazione frame con PIL (`extract_frames.py`): primo frame + **nome file stampato in-pixel**,
      stessa protezione del vision pass contro il tool di lettura che scambia i file
- [x] 5.3 Analisi in **12 subagenti** (~42 domande ciascuno) con la guida "Regole di precedenza"
      (gerarchia fonti, art.145 destra libera, eccezioni rotaia/emergenza, Dare precedenza/STOP/Diritto di
      precedenza, svolta a sinistra, impegno dell'incrocio, private, inversione, rotatorie) e formato
      **identificazione incrocio → ordine di passaggio → analisi veicolo per veicolo → motivazione →
      "Per questo la domanda è Vera/Falsa."** Il verdetto doveva essere **dedotto dal disegno**: i
      subagenti non ricevevano `is_correct`
- [x] 5.4 **Gate automatico** confronto verdetto generato ↔ `questions.is_correct`:
      **402/510 (78,8%)** al primo giro su 25 immagini. Retry su quelle 25 (4 lotti, con la chiave
      ufficiale come feedback per far trovare la lettura coerente della figura) + rigenerazione di un lotto
      scritto senza accenti → **510/510 (100%)**, 0 testi senza accenti, 0 meta-linguaggio
- [x] 5.5 Scrittura in `question_translations.explanation` (`lang_code='it'`) per tutte e 510, **sovrascrivendo
      le 8 spiegazioni LLM preesistenti** (incompatibili con la chiave). `es` lasciata vuota di proposito
- [x] 5.6 Verifica runtime: **12/12 campione** da cache con testo identico al DB, latenza **0,5-2,2 s**
      (prima 30-150 s con LLM ogni volta). A runtime su queste categorie **non parte più alcun LLM**
- [x] 5.7 **Traduzione `es` (latino americano) delle 510 spiegazioni**: 12 subagenti, ~42 testi ciascuno
      (~33.000 caratteri), allineati al `text_es` già presente per la terminologia dell'app. Verdetto in
      spagnolo reso come chiusura fissa **"Por esto la pregunta es Verdadera./Falsa."** (mai
      "correcta/incorrecta", per non rompere il parser del verdetto). Gate: 510/510 con chiusura coerente
      all'italiano (258 Verdadera / 252 Falsa = ground truth), 0 residui italiani, 0 meta-linguaggio,
      0 sbilanciamenti di lunghezza. Verifica runtime `lang_code: "es"` → **8/8 dalla cache**, 0,5-0,8 s
- [x] 5.8 Correzione di 42 spiegazioni italiane: la frase dell'ordine ripeteva la lettera di un veicolo
      che "si impegna, si ferma al centro e riprende la svolta" (es. `N -> R -> A -> N`) → riscritta in
      prosa esplicita; le 42 corrispondenti spagnole sono state ritradotte di conseguenza

**Note per il futuro**: lo stesso approccio è riutilizzabile per le altre categorie "per figura" (limiti,
distanze, …) finché l'immagine resta necessaria alla risposta; conviene fare un solo giro, non la cache
LLM. Per nuove lingue: stessa procedura, `es` funziona da riferimento di terminologia.

## Fase 4 — Chat contestualizzata + immagine ✅ COMPLETATA

- [x] 4.1 Moduli condivisi `_shared/` (`env`, `cors`, `llm`, `embedding`, `retrieval`) — `explain-question`
      riscritto su `_shared` (761 → ~489 righe), `deno check` OK
- [x] 4.2 `chat/index.ts`: payload `question_id` → retrieval ibrida come `explain-question` + contesto dalla
      spiegazione cache della domanda + nota sul segnale; risposta con `retrieval_path`/`reranked`
- [x] 4.3 Client: `store/chat.ts` (`questionId` + campo `question_id`, azzerato da `clearChat`),
      `app/quiz.tsx` manda `currentQuestion?.id`
- [x] 4.4 Deploy DEV + test flusso quiz→chat: con `question_id` → `path=sign`, follow-up con storico OK,
      senza `question_id` → `path=cosine`, senza messaggio → 400, rate limit decrescente

## Chiusura
- [x] C.1a **Primo giro di valutazione DEV↔PROD** (20 domande, 3 gruppi, script `eval_dev_prod.py`):
      - Gruppo **A** (10 domande segnaletiche con segnale identificato → Path A): **DEV 7/10 vs PROD 6/10**
      - Gruppo **B** (5 segnaletiche `NON_IDENTIFICATO` → cosine): DEV 5/5 vs PROD 5/5 (2 errori iniziali, fixati con il bug #3)
      - Gruppo **C** (5 non-segnaletiche → cosine): DEV 2/3 risposte corrette (2 errori da quota 429) vs PROD 4/5
      - Totale: **DEV 14/20 vs PROD 15/20** — campione piccolo, latenza DEV 7,9 s vs PROD 0,6 s (PROD da cache)
      - Metrica: confronto del verdetto finale (`Vera`/`Falsa`) con `questions.is_correct` (4.670 F / 4.300 V)
- [x] C.1b **Evaluation estesa**: 17 domande fuori dal giro base (immagini classificate in fase 3) → 17/17
      verdetto corretto su DEV, tutte in Path A. Rimane da estendere il campione del gruppo A (10) a 50-100
      e a misurare l'hit-rate del chunk recuperato (non solo il verdetto).
- [ ] C.1c **Test con i modelli gemma di produzione** (`gemma-4-26b-a4b-it` / `gemma-4-31b-it`): tasso di risposta vuota,
      latenza, qualità su ~15 domande — da fare **prima** della promozione
- [x] C.2 `doc/PROJECT.md` aggiornato (sezioni `explain-question` e `chat`); `doc/APP_STRUCTURE.md` aggiornato
- [x] C.3 **Promozione PROD eseguita (2026-09-28, senza backup per decisione utente)**:
      `db push --include-all --project-ref pydwxyxvnkytelbapbsk` → **8 migrazioni** applicate
      (`160000` embedding 1024→768 + NULL, `160100` sign retrieval, `160200` `sign_to_chunk` 204 righe,
      `170000` policy storage, `20260928120000` `image_sign_type` 8.970, `20260928120100` cache spiegazioni
      1.022, `20260928130000` drift schema DEV, `20260928130200` snapshot 12 RPC). Storico **10/10** allineato;
      fingerprint DEV==PROD (COL/IDX/FN identici, **134/134 corpi funzione uguali**), unica differenza residua
      la policy storage propria di PROD (`easyPatenteProd`) e le differenze di riga decise dall'utente
      (`icon_url`/`title` categorie) che **non** sono state sincronizzate.
      Secret: `STORAGE_URL=https://pydwxyxvnkytelbapbsk.supabase.co/storage/v1/object/public/easyPatenteProd`.
      Deploy: `chat` v4→**v6**, `explain-question` v4→**v6**.
      Smoke test PROD: 4/4 figure da cache (`from_cache=true`, testo identico al DB, 0,5–2 s, IT+ES),
      `path=sign` 19,5 s e `path=cosine` 24,8 s con verdetto corretto → spiegazioni + **embedding persistiti
      (`embedding_non_null` 0→2, tipmod 768)**, cioè il bug `vector(1024)` è risolto in produzione.

---

## Riferimenti rapidi

- **Migrations** (tutte su DEV e PROD, storico 10/10): `20260924160000_fix_questions_embedding_dim`,
  `20260924160100_add_sign_retrieval`, `20260924160200_populate_sign_to_chunk` (righe scritte, non
  `db execute`), `20260924170000_add_storage_read_policy`, `20260928120000_backfill_image_sign_type`,
  `20260928120100_import_explanations_cache`, `20260928130000_reconcile_dev_schema_drift`,
  `20260928130200_align_function_definitions`
- **Edge function modificata**: `supabase/functions/explain-question/index.ts` (deployata su DEV)
- **Script**: `ragPipeline/batch_identify_signs.py` (riscritto), `ragPipeline/signImageMatcher/populate_sign_to_chunk.py` (fixato)
- **Journal smoke**: `/var/folders/nh/fkkdkk391j3b65tr139vpld40000gn/T/opencode/sign_journal.jsonl` (cancellare)
- **Key PROD**: `supabase/functions/.env.production` → `SUPABASE_URL`/`SUPABASE_SECRET_KEYS`; **key DEV**: `/var/folders/nh/fkkdkk391j3b65tr139vpld40000gn/T/opencode/dev_secret.env` (chmod 600)
- **Valutazione**: `/var/folders/nh/fkkdkk391j3b65tr139vpld40000gn/T/opencode/eval_dev_prod.py` + `eval_{A,B,C}.json` + `eval_results.json`
- **Vision pass fase 3** (stesso dir. temporaneo): `worklist.json` (271 immagini), `evidence.json` (domande+`is_correct`),
  `vision_me/` (originali) + `vision_labeled/` (**nome file stampato in-pixel**, obbligatorio per il tool di lettura),
  `labels_slice_{1..8}.jsonl` → consolidato in `labels_all.json`, `proposals.json` (121 nomi nuovi),
  `proposal_mappings_part{1,2}.json` → `proposal_mappings_all.json`, `apply_all.sql`/`apply_props.sql`
- **Verifica end-to-end**: `/var/folders/nh/fkkdkk391j3b65tr139vpld40000gn/T/opencode/verify_me.py` (17 domande → 17/17, tutte Path A)
- **Spiegazioni figure (fase 5)** (stesso dir. temporaneo): `gif_frames/` (85 frame etichettati in-pixel),
  `worklist.json` (85 immagini → 510 domande), `gif_out/batch_{01..12}.json` (output subagenti),
  `gif_retry/retry_{01..04}.json` + `out_retry_*.json` (2° giro), `gif_retry/regen_09.json` (accenti),
  `ground_truth.json` (verdetti ufficiali, **mai** dato ai subagenti), `gate_report.json` (gate 510/510),
  `final_texts.json` (testi finali), `apply_explanations.sql` (4 statement, 510 righe),
  `verify_gif_cache.py` (verifica runtime 12/12)
- **Traduzione `es` (fase 5)**: `es_src.sql` → `es_src.json` (IT + `text_es` + expl IT), `es_batches/es_{01..12}.json`
  → `out_es_{01..12}.json`, `es_batches/fix_order.json` → `out_fix_order.json` (42 ritradotti),
  `es_final.json` (510 testi ES), `apply_es.sql`, `verify_es_cache.py` (8/8 dalla cache)
- **Correzione frasi d'ordine**: `it_order_fixed.json` (42 testi) + `fix_it_order.sql`
- **DB via**: `npx supabase db query --linked --file <f> --output-format json` (usare `--file`, gli UUID vanno **quotati**)
  ⚠️ **mai accentare le query passate via heredoc**: gli accenti vengono corrotti dalla shell → scrivere il
  file SQL con Python (`encoding='utf-8'`) e usare `\u00e8` nei pattern Python
- **Test immagini**: nomi + domande mostrano che stessi CODE hanno contenuti coerenti; visuale agent su file scaricati con `Read`
