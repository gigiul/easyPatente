# EXECUTION PLAN — RAG con immagini (DEV)

> Ambiente: DEV `mvkxafzywzuohnbqjqmo` · LM Studio `:1234` (non più usato in 2c)
> Obiettivo: migliorare la retrieval RAG per le domande la cui risposta dipende dall'immagine (segnali stradali).
> Regola: tutto su DEV; promozione PROD solo a fine validazione.
> **Ultimo aggiornamento: 2026-09-25 — Fase 2c COMPLETATA.** Dump PROD→DEV fatto (DEV = PROD: 1.373 immagini).
> La classificazione dei segnali è stata **rifatta interamente con analisi visiva (non qwen)**: 1.373/1.373 immagini,
> 352 etichette cambiate, QA manuale su 226 cambi + 135 low-confidence. Dettagli sotto.

## Stato

| Fase | Stato | Note |
|------|-------|------|
| 0 — Fondamenta | ✅ | `vector(1024)`→`vector(768)` applicata su DEV |
| 1 — Category filter | ✅ | deployato su DEV; test: top-3 solo cap-04 con filtro |
| 2a — Migration schema | ✅ | `image_sign_type` + `sign_to_chunk` + RPC verificate su DEV |
| 2b — populate sign_to_chunk | ✅ | 79/79 righe (48 exact + 13 alias + 18 partial), RPC Path A OK |
| 2c — batch identify signs | ✅ **COMPLETATA** | dump PROD→DEV ok (1.373 img). qwen: 2 run (53 min + 8 min) poi **sostituito da classificazione visiva** (subagenti) su tutte le 1.373. Esito: 416 con segnale / 957 NON_IDENTIFICATO, 0 NULL |
| 2d — retrieval ibrida | 🔄 in corso | explain-question hybrid retrieval |
| 4 — chat contestualizzata | ⬜ | `_shared/` + payload + UI |
| C — Chiusura | ⬜ | evaluation + docs + checklist PROD |

---

## 🔴 FERMO IMMOBILE — dove siamo (leggi prima di riprendere)

**Motivo sospensione (richiesta utente 2026-09-24):** prima di lanciare il batch, l'utente
deve (1) ricaricare le immagini di PROD perché c'era un errore, (2) fare un dump di PROD
e portarlo su DEV. Solo dopo si rianalizza e si decide dove girare il batch.

### Fatti accertati sull'analisi immagini (non ri-verificare)

1. **DEV e PROD hanno set di immagini DIVERSI, sovrapposizione ZERO:**
   - DEV: 9.118 righe con immagine → **2.509 filename distinti**, naming `QB_<CAP>_imageN.png` / `.jpg`
   - PROD: 8.970 righe con immagine → **2.031 filename distinti**, naming `QB_<CAP>_img_N.jpg` / `.gif`
   - `comm` tra i due set: **0 in comune, 0 condivisi**. Il bucket DEV contiene solo file DEV-style; PROD (bucket `easyPatenteProd`, **privato** — sign API funziona, public URL 400) contiene solo file PROD-style.
2. **I CODE delle domande si sovrappongono** (es. `Q_PRECEDENCEVEHICLES_HARD_1`, `Q_VEHICLES_3` presenti in entrambi) → stessa banca domande, ma immagini re-caricate con naming diverso.
3. Conseguenza: un batch fatto su DEV **non si propaga a PROD per filename**. Serve il re-baseline (dump PROD→DEV) per riallineare, oppure girare il batch due volte.
4. Dopo il dump, **ri-contare** distinct filenames DEV e riconfrontare con PROD prima di ripartire.

### Stato smoke test Fase 2c (DATI DI DEV VECCHI — da azzerare/ignorare dopo il dump)

- Batch riscritto e validato end-to-end su 3 file → flush riuscito, DB aggiornato:
  - `QB_ADDITIONALPANELS_HARD_image1.png` → `Divieto di sosta` (verificato a occhio ✓)
  - `QB_ADDITIONALPANELS_HARD_image10.png` → `Lavori in corso`
  - `QB_ADDITIONALPANELS_HARD_image11.png` → `NON_IDENTIFICATO`
- **Queste 3 righe DEV diventeranno obsolete dopo il dump PROD→DEV**: azzerare
  `questions.image_sign_type` e cancellare il journal
  (`/var/folders/nh/fkkdkk391j3b65tr139vpld40000gn/T/opencode/sign_journal.jsonl`) prima del run reale.

### Decisioni prese e pronte (da confermare al ripristino)

| Decisione | Esito | Motivo |
|---|---|---|
| Modello LLM | **`qwen/qwen3-vl-30b`** (non gemma-4-26b) | `google/gemma-4-26b-a4b-qat` è in loop di thinking infinito (4096 token tutti reasoning, risposta vuota, `chat_template_kwargs.enable_thinking=false` non ha effetto). Validato qwen3-vl-30b: **6/6 corretti** su test set (4 segnali veri + 2 negativi), **1.9s/immagine** |
| Formato output | **ID numerico 0..79** (lista numerata nel prompt, 0 = NON_IDENTIFICATO) | elimina hallucination (il modello non può inventare nomi fuori lista) e il problema di nomi quasi-giusti non censiti |
| Trasporto DB | **`npx supabase db query --linked --file ... --output-format json`** con retry | la vecchia `service_role` JWT è disabilitata dal 2026-08-17; la Management API maschera le `sb_secret_` (anche alla creazione — key `rag_batch_local` creata ma inutilizzabile). Serve solo `SUPABASE_DB_PASSWORD` nel shell dell'utente (consigliato: esportarla anche nel shell dell'agent o scriverla in un file sorgibile) |
| Storage immagini | DEV: public URL OK. PROD: **bucket privato** → serve sign API con secret key PROD (già in `quizConverter/.env`) | verificato |
| Dedup | 1 chiamata LLM per **filename**, poi propagate a tutte le righe con stesso filename (`UPDATE ... FROM (VALUES ...)`) | 2.509 chiamate invece di 9.118 |
| Journal/flush | JSONL append-only + flush ogni 50 file, risumibile (merge DB null + journal) | crash-safe |

### Prossimi passi appena arrivato il dump PROD→DEV

- [ ] R.1 Confermare che il dump ha portato le immagini PROD su DEV (recount distinct filenames DEV, attesi ~2.031 o il nuovo valore)
- [ ] R.2 Azzerare `questions.image_sign_type` su DEV (migration one-shot o SQL) + cancellare journal smoke test
- [ ] R.3 Riconfronto set filename DEV↔PROD (stessi file? stessi code?) → decidere target batch:
       - se dopo il dump DEV == PROD → batch su DEV, poi propagatione a PROD per filename/code in chiusura
       - se ancora diversi → valutare batch separato su PROD (serve promozione migration schema su PROD prima, o load della colonna)
- [ ] R.4 **Checkpoint utente**: conferma modello (`qwen/qwen3-vl-30b`), conferma target, poi run completo (~2.509 file × ~2-4s ≈ 2-2.5h)
- [ ] R.5 Report % identificati / NON_IDENTIFICATO e spot-check visivo campione

---

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

## Fase 2c — Batch identificazione ⏸️ (pronto, sospeso — vedi sezione FERMO)
- [x] 2c.0 Ricerca vincoli: legacy key disabilitata, gemma in loop thinking → soluzioni sopra
- [x] 2c.1 Script `ragPipeline/batch_identify_signs.py` **riscritto**: prompt a ID numerico, modello `qwen/qwen3-vl-30b` (env `LLM_MODEL`), trasporto `db query` (nessuna secret key), dedup filename, journal JSONL + flush ogni 50, resume, `--limit`/`--flush-every`
- [x] 2c.2 Validazione modello: 6/6 su test (clacson→26, bici→78, camion→29, pedone→77, camper→0, città→0), 1.9s/media
- [x] 2c.3 Smoke test `--limit 3` end-to-end → 3/3 + flush DB verificato (vedi sopra, dati da azzerare)
- [x] 2c.4 Run completo qwen (`qwen/qwen3-vl-30b`): 1.373/1.373, 52,7 min, 2,3 s/file, 0 falliti
- [x] 2c.5 QA → **3 errori sistematici trovati in qwen** (dosso/cunetta, sosta/fermata, direzione dx/sx). Second pass mirato: 98 cambi, ma su sosta/fermata peggiorava (mia hint sul glifo fermata era falsa: fermata = **X**, non diagonale+verticale)
- [x] 2c.6 **Riclassifica 1.373/1.373 con analisi visiva** (subagenti, 55 batch da 25). Regole ancorate ai glifi ufficiali scaricati da Wikimedia (sosta=1 barra, fermata=X, direzione obbl.=freccia orizzontale, passaggio obbl.=freccia diagonale in basso)
- [x] 2c.7 QA manuale: 135 low-confidence + 226 cambi rivisti → 46 + 25 correzioni. Totale **352 etichette cambiate** vs qwen
- [x] 2c.8 Scrittura DB (solo `image_sign_type`), journal aggiornato, backup in `labels_before_vision.json` / `sign_journal.jsonl`

## Fase 2d — Retrieval ibrida edge function
- [ ] 2d.1 `explain-question`: se `image_sign_type` NON NULL/non `NON_IDENTIFICATO` **e** la domanda è in categoria segnaletica (gate `SIGN_CATEGORY_IDS` — protegge da casi come image16 "autostrada" dove il modello forzava un nome) → `match_chunks_by_sign` (Path A); altrimenti fallback cosine + `filter_category_id`
- [ ] 2d.2 Deploy DEV + test ~10 domande trappola → `sources` corretti
- Nota: le immagini "scena/veicolo" (piazza, camper) devono restituire `NON_IDENTIFICATO` → retrieval normale.

## Fase 4 — Chat contestualizzata + immagine
- [ ] 4.1 Estrai moduli condivisi `_shared/` (cors, fetchImage, callLLMWithImage, embedding)
- [ ] 4.2 `chat/index.ts`: accetta `question_id`/`image_filename`, retrieval come explain, VL se immagine
- [ ] 4.3 Client: `sendMessage` + contesto, `handleAskAIChat` passa `questionId`+`imageFilename`, thumbnail in UI chat
- [ ] 4.4 Deploy DEV + test flusso quiz→chat con immagine

## Chiusura
- [ ] C.1 Evaluation: ~10 domande trappola, hit-rate retrieval prima/dopo
- [ ] C.2 Aggiorna `doc/PROJECT.md` + `doc/APP_STRUCTURE.md`
- [ ] C.3 Checklist promozione PROD (migrations 0/1/2a/2b + edge functions + propagatione `image_sign_type` — solo dopo OK utente)

---

## Riferimenti rapidi

- **Migrations create**: `20260924160000_fix_questions_embedding_dim`, `20260924160100_add_sign_retrieval`, `20260924160200_populate_sign_to_chunk` (tutte su DEV)
- **Edge function modificata**: `supabase/functions/explain-question/index.ts` (deployata su DEV)
- **Script**: `ragPipeline/batch_identify_signs.py` (riscritto), `ragPipeline/signImageMatcher/populate_sign_to_chunk.py` (fixato)
- **Journal smoke**: `/var/folders/nh/fkkdkk391j3b65tr139vpld40000gn/T/opencode/sign_journal.jsonl` (cancellare)
- **Key PROD** (sola lettura/sign): `quizConverter/.env` → `SUPABASE_SECRET_KEYS`
- **Test immagini**: nomi + domande mostrano che stessi CODE hanno contenuti coerenti; visuale agent su file scaricati con `Read`
