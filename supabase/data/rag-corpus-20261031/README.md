# Revisione corpus RAG — 31 ottobre 2026

Stato: **applicata su DEV** `mvkxafzywzuohnbqjqmo` il 31 ottobre 2026. Prod `pydwxyxvnkytelbapbsk` non è stato toccato. La patch non è pubblicata su GitHub.

La patch riguarda soltanto `public.manual_chunks`: **13 aggiornamenti e 14 inserimenti**, da **554 a 568** righe. Mantiene gli ID delle righe esistenti e la versione base `09072026`. Le fonti e la data della revisione sono registrate in `source_file`, `article_ref` e `llm_context`.

Correzioni: rinnovo a 80 anni, ritenuta bambini, esenzioni cinture, moto in autostrada, A1/A/B, introduzione patenti, condizioni neopatentati e separazione di due schemi di incrocio. Integrazioni: AM, A2, B1, B96/BE, punti e recupero, equivalenze, deroga B per merci ad alimentazione alternativa, seggiolini/airbag, antiabbandono e abbigliamento moto.

Non modifica schema, RPC, funzioni Edge, recupero, spiegazioni, cache o produzione. Il doppione degli incroci e le pagine OCR mancanti non vengono cancellati o ricostruiti senza verifica della figura originale. Non è una certificazione di completezza normativa di tutto il corpus.

## Provenienza embedding

- Provider: **locale**.
- Modello: `unsloth/embeddinggemma-300m-GGUF`, file `embeddinggemma-300M-BF16.gguf`, caricato dal server llama.cpp locale.
- Preprocessing: testo grezzo, nessun prefisso automatico; mean pooling del GGUF; proiezioni ufficiali `2_Dense` 768→3072 e `3_Dense` 3072→768 del modello `unsloth/embeddinggemma-300m` (FP32); normalizzazione L2.
- Il server Unsloth Studio su `http://127.0.0.1:8888/v1` espone il GGUF senza i due layer `Dense` della pipeline sentence-transformers: usato direttamente produce coseno ≈ 0,01 contro i vettori esistenti. Per questo la generazione passa da `local_embedding_server.py`, che aggiunge le proiezioni ufficiali e mantiene lo stesso spazio vettoriale.
- Verifica di compatibilità sui tre riferimenti esistenti: coseni **0,999771 / 0,999795 / 0,999775** (soglia minima 0,98). Dimensioni 768, valori finiti, norma non nulla.
- I 27 vettori nuovi/aggiornati sono locali. I 541 chunk non toccati conservano gli embedding Cloudflare originali; la compatibilità è verificata dai riferimenti, non è stato rigenerato il corpus intero.

## Generazione

`patch.json` contiene i valori finali dei contenuti, i digest dello stato DEV da sostituire e i 27 embedding reali. La migrazione in `supabase/migrations/` è già renderizzata e pronta.

Da root del repository, con il server locale di adapter attivo:

```bash
python3 supabase/data/rag-corpus-20261031/local_embedding_server.py
python3 supabase/data/rag-corpus-20261031/prepare.py --embed \
  --provider local \
  --endpoint http://127.0.0.1:8890/v1 \
  --model unsloth/embeddinggemma-300m-GGUF \
  --quantization "BF16 (GGUF transformer); FP32 dense heads" \
  --preprocessing "raw text; GGUF mean pooling; 2_Dense 768->3072 (FP32); 3_Dense 3072->768 (FP32); L2 normalize; no prompt prefix" \
  --migration supabase/migrations/20261031142541_refresh_rag_corpus_verified_20261031.sql
```

Per rigenerare soltanto la SQL dallo stato locale:

```bash
python3 supabase/data/rag-corpus-20261031/prepare.py --render \
  --migration supabase/migrations/20261031142541_refresh_rag_corpus_verified_20261031.sql
```

Il generatore non applica SQL e non richiede credenziali Supabase. Se i testi vengono cambiati dopo la generazione, l'hash degli input impedisce il rendering con embedding non coerenti. I `token_count` seguono lo stimatore di fallback del chunker esistente (1,3 token/parola); sono stime.

## Applicazione e controlli

La migrazione è un singolo blocco atomico. Risolve le categorie con `sort_order` e `is_hard`, senza UUID generati hardcoded. Verifica ogni riga prima della prima scrittura e abortisce se lo stato differisce dallo snapshot atteso o dallo stato finale già applicato. Conserva gli UUID delle righe esistenti; quelle nuove usano il default del DB. La riesecuzione sui dati già aggiornati non cambia righe né timestamp. Testi e rispettivi embedding vengono aggiornati insieme.

Applicazione eseguita su DEV con la sola migrazione verificata. La storia delle migrazioni è stata allineata con `supabase migration repair --status applied --linked 20261031142541`.

Controlli dopo l'applicazione:

- 568 chunk totali; 13 righe aggiornate e 14 inserite.
- 768 dimensioni min/max su tutto il corpus; 0 embedding nulli; 0 vettori non finiti o a norma nulla.
- 0 duplicati `(chunk_id, manual_version)`.
- ID delle 13 righe esistenti invariati; 14 ID nuovi per gli inserimenti.
- Hash delle 541 righe estranee alla patch invariato (`38da57dd4ed1e70951a7432c31d6218a`).
- Hash delle spiegazioni invariato (`6bc4345821d056ec5a9286f5e95294cf`), 9.995 spiegazioni, 26.910 traduzioni, 8.970 domande.
- Test di rollback: 554 chunk, hash completo del corpus identico al pre-applicazione (`f90a5227d2faf4ed9176249003589a6e`), 0 righe inserite residue.
- Test di idempotenza: seconda esecuzione reale senza variazioni di hash o `updated_at`.
- Recupero verificato sui temi aggiornati con `match_manual_chunks`, senza modificare logica o generare nuove spiegazioni: AM → `v1/cap-23/sez-11/001` (0,7385); neopatentati → `v1/custom/test_001` (0,7421); seggiolini/airbag → `v1/cap-21/sez-07/001` (0,6420); recupero punti → `v1/cap-23/sez-15/002` (0,7127).

## Backup e rollback

- Snapshot pre-applicazione verificato: `backup/before_rows_20261031_preapply.json` (13 righe originali, inclusi embedding).
- Copia originale del pacchetto: `backup/before_rows.json` (contenuto verificato identico).
- Ripristino mirato: `rollback/20261031142541_rollback.sql`. Ripristina le 13 righe per ID stabile e rimuove le 14 righe inserite; rifiuta di sovrascrivere righe modificate dopo la patch. Non è stato applicato.
- Il rollback è stato provato in transazione annullata insieme alla migrazione: riporta a 554 chunk e agli hash pre-applicazione.

Questi file contengono contenuti ed embedding derivati dal database: non vanno pubblicati su un repository pubblico senza autorizzazione esplicita.

## Pubblicazione

Il lavoro è versionato solo localmente sul branch `feat/rag-corpus-20261031`. Nessun push, nessuna PR, nessuna modifica a Prod. La patch non è stata pubblicata su GitHub.

## Fonti

Fonti per ogni chunk in `patch.json`: PDF fornito dall'utente per gli argomenti e le caratteristiche di protezione; articoli del Codice su ACI e pagine MIT per verifica delle regole e delle equivalenze. In particolare il PDF p.220 riporta un'età errata per l'accesso graduale alla A: è stata usata la regola MIT di 20 anni con A2 da due anni. Per B1 si esplicitano i valori del testo dell'art.116 senza confonderli con criteri diversi di omologazione. La p.296 del PDF non è usata per importare i limiti neopatentati contraddittori.
