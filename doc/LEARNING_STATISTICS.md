# Statistiche e preparazione — implementazione locale

Base: `gigiul/easyPatente`, main, commit `2ab73a04c446c1a90363a9e9ef53ad9d7d808678`.
Nessuna migrazione eseguita su Supabase, nessun commit/push o deploy remoto.

## Cosa cambia

Dal profilo si apre `/statistics`. Riepilogo, indice spiegabile, simulazioni, andamento errori, categorie, copertura, errori/recuperi e piano facoltativo sono disponibili senza controllo Premium. I contenuti dei quiz mantengono gli accessi esistenti. Locali aggiornati: italiano, spagnolo, bengalese. Nessuna dipendenza aggiunta al prodotto.

La sorgente delle statistiche è il ledger privato `learning_private.attempts` + `attempt_questions`. `current_attempt` collega il tentativo allo stato di ripresa in `user_quiz_progress`. Snapshot della soluzione e della categoria non sono esposti dal nuovo endpoint. Le operazioni privilegiate sono private, con `search_path` fissato e controllo `auth.uid()`; gli endpoint pubblici sono wrapper `SECURITY INVOKER`. Le tabelle private hanno RLS e nessun grant alle API client. Non aggiungere `learning_private` agli schemi esposti in Supabase.

Il trigger su `user_quiz_progress` rende atomici progresso, snapshot, chiusura e lista errori e supporta gli upsert dei vecchi client. Il nuovo client usa `open_learning_attempt` e `save_learning_progress`, con revisioni ottimistiche e coda ordinata. Un retry identico non incrementa i contatori; un salvataggio concorrente non identico è rifiutato. `record_exam_mistakes` rimane come no-op autenticato per i vecchi client: la finalizzazione è già stata registrata dal trigger. Il ripasso ora ha `batch_type='review'` e non entra nelle promozioni.

Le prove concluse sono immutabili: il pulsante Ripeti crea un tentativo nuovo. Il risultato contiene già l'elenco errori; il precedente pulsante di ritorno dal risultato alla sessione modificabile viene disabilitato. Le altre navigazioni restano disponibili. Il nuovo client richiede la migrazione: non pubblicarlo prima della migrazione dell'ambiente destinatario.

I vecchi client possono continuare a scrivere progresso, ma i loro tentativi rimangono `legacy` senza prima risposta/lingua inventate. Non riaprire una prova conclusa modificando le risposte: usare reset. Le chiamate `get_user_exam_history` sono ora ristrette all'utente autenticato ed escludono i ripassi. Le nuove statistiche e i punteggi restituiti da `get_my_quiz_progress` usano lo snapshot.

## Algoritmo v1

`score = round(0.50 E + 0.35 M + 0.15 C)`; algoritmo deterministico ed euristico, non probabilità di promozione.

E: ultime 20 simulazioni native, complete da 30 domande, in italiano senza seconda lingua, negli ultimi 30 giorni. `E = 100 * (0.8 * quota_superate + 0.2 * max(0,1-media_errori/6))`.

M: osservazioni native negli ultimi 60 giorni; prima risposta per pratica/ripasso, risposta finale per simulazione. Per domanda considerare solo la prima osservazione di ogni giorno e al massimo gli ultimi 3 giorni, con peso `2^(-età_in_giorni/30)`. Probabilità regolarizzata `(1+somma(peso*corretta))/(2+somma(peso))`. Per categoria media delle domande osservate, moltiplicata per `min(1,domande_recenti/10)`; M è la media delle categorie attive. Una categoria mai studiata è «da valutare».

C: `100*min(1,domande_uniche_affrontate/(0.5*catalogo_attivo))`. La copertura mostrata all'utente rimane quella reale, senza riscalarla. Una domanda saltata non è «affrontata». Le mancanti in una simulazione conclusa sono errori nel punteggio esame; non simulano una risposta nell'accuratezza per categoria, nella copertura o nell'obiettivo.

Il punteggio compare solo con almeno 5 simulazioni valutabili, 100 domande recenti e almeno 5 categorie (o tutte se meno di 5). Fasce: <50 da costruire; 50–69 in crescita; 70–79 quasi pronto. Da 80, «Buona preparazione» richiede anche almeno 10 esami recenti, 8/10 superati, media ultime 10 ≤3, copertura ≥50% e almeno min(10,totale categoria) domande recenti in ogni categoria. Senza questi requisiti resta «Quasi pronto». I conteggi recenti sono mostrati insieme alle condizioni. Cambiare data/obiettivo/filtro non cambia il grado di preparazione. Dopo inattività il giudizio torna «Valutazione in corso»: non si conserva un punteggio precedente come se fosse attuale.

Errori ricorrenti: almeno 2 osservazioni errate in tentativi diversi negli ultimi 30 giorni. Recupero: ultima risposta corretta dopo un errore precedente. Consolidamento: ultime due osservazioni corrette consecutive, separate da almeno 24 ore e successive all'ultimo errore. Ricaduta: ultima osservazione errata dopo una corretta. La lista di ripasso corrente resta `user_mistakes`, aggiornata alla conclusione dei tentativi; gli altri contatori derivano dallo storico nativo, anche per pratiche non ancora concluse.

Suggerimenti: ripresa valida, categoria con dati insufficienti, ripasso errori ricorrenti, categoria debole, copertura, simulazione in italiano. Le categorie aprono la selezione schede esistente; non viene introdotto un generatore adattivo. Il ripasso filtrabile per categoria è disponibile via RPC `generate_category_mistakes_review`.

## Applicazione solo locale

1. Creare un branch locale partendo dal commit base, oppure confrontare il diff se main è avanzato. Lo ZIP contiene i sorgenti completi aggiornati in `easyPatente/` e il diff esterno `changes.patch`. Non usare contemporaneamente copia e patch.
2. Copiare le proprie variabili d'ambiente locali; nessuna chiave è inclusa. Installare con `npm ci`. Il lockfile contiene la correzione minima di un disallineamento Babel preesistente che impediva `npm ci`: nessuna modifica a `package.json`.
3. Con Supabase CLI e Docker locali: `supabase start`, poi `supabase db reset` sul database locale. Questa seconda operazione cancella solo i dati del Supabase locale: usarla su un ambiente locale sacrificabile. Non usare `--linked`, `--db-url`, `link`, `db push` o deploy per provare il pacchetto.
4. Configurare il client per il Supabase locale e avviare Expo. Il flag `learning_statistics`, inserito dalla migrazione, controlla la sola UI ed è inizialmente `true`; vale per tutti i piani account. Se manca/è disattivato, la card è nascosta. Il ledger continua a funzionare anche con UI disattivata.
5. Provare nuovo account, modulo, reset, esame italiano/tradotto, ripasso, timeout, errore di rete e accesso da due client. Prima di qualsiasi futura pubblicazione confrontare schema/migrazioni dell'ambiente destinatario e seguire `.agents/SUPABASE_WORKFLOW.md`.

La migrazione `20261031161918_learning_statistics.sql` importa soltanto l'ultimo stato noto di ogni scheda, marcato `legacy`, e preserva integralmente la lista errori precedente. Non può ricostruire tentativi cancellati/reset, lingue o prime risposte. La creazione degli snapshot è atomica e transazionale. Il backfill non produce nuove righe se un progresso ha già un tentativo collegato; la migrazione, come le altre, viene applicata una sola volta dal migration runner.

## Test riproducibili

```bash
npm ci
npm run typecheck
npx eslint app/statistics.tsx components/LearningSummary.tsx components/quiz/QuizSaveStatus.tsx hooks/useLearningStats.ts hooks/useQuizPersistence.ts hooks/useQuizSession.ts hooks/useExamSession.ts hooks/useQuizProgression.ts queries/learning.ts types/learning.ts lib/learning.ts
```

Test DB e hook senza credenziali e senza contatti con Supabase. Installazione isolata delle sole dipendenze di test (non modifica il progetto):

```bash
learning_test_runtime="$(mktemp -d)"
npm install --prefix "$learning_test_runtime" --no-audit --no-fund @electric-sql/pglite@0.5.14 react@19.2.0 react-test-renderer@19.2.0
PGLITE_MODULE="$learning_test_runtime/node_modules/@electric-sql/pglite/dist/index.js" node tests/learning-database.mjs
LEARNING_TEST_MODULES="$learning_test_runtime/node_modules" node tests/learning-client.cjs
# Opzionale: 100.000 osservazioni per un utente, solo nel DB WASM temporaneo
LEARNING_BENCHMARK=1 PGLITE_MODULE="$learning_test_runtime/node_modules/@electric-sql/pglite/dist/index.js" node tests/learning-database.mjs
```

Il test database estrae le tabelle dal baseline reale rimuovendo solo le colonne vector, crea un'identità Auth simulata e applica la nuova migrazione. Verifica backfill, preservation errori, false/assente, reset, retry, revisioni, isolamento, snapshot privati, esami vs ripassi, scadenza, preferenze, indice/fasce/scadenza dati e cancellazione account. Non sostituisce una verifica della catena completa di migrazioni su Supabase locale con Auth/Storage reali.

Il test React usa renderer in memoria e mock API, con la logica degli hook reale: nessuna riscrittura del calcolo da confrontare con sé stesso. Verifica coda, errore/retry, conservazione dell'ordine, hydration senza reset involontario, risposta/finalizzazione, data e suggerimento di ripresa. Il warning di deprecazione di react-test-renderer riguarda il solo test isolato.

## Verifiche eseguite e limiti

TypeScript, lint dei file nuovi/hook modificati, test DB e test hook: passati. Export web Expo: compilato con variabili fittizie, senza accesso a database. La build nativa non è stata eseguita.

Benchmark PGlite/WASM con oltre 100.000 risposte per utente: cinque richieste tra circa 1,4 e 1,55 secondi, payload 8.329 byte sul fixture. È una misura locale WASM, non un p95 PostgreSQL/Supabase. L'obiettivo del piano di <500 ms non è verificato: prima di un rollout ad alto volume misurare su PostgreSQL reale con EXPLAIN ANALYZE e considerare aggregati incrementali se necessario. Il client riceve dati aggregati e storico a pagine, non l'intero elenco di risposte.

La verifica visiva/browser non è completata: l'ambiente non aveva un browser installato e il download Chromium non è riuscito. La struttura usa componenti React Native tematizzati, controlli accessibili e valori testuali accanto alle barre, ma serve QA visivo su web/iOS/Android reali prima del rilascio.

Non è incluso un motore offline: in caso di errore le risposte restano nello stato della schermata con retry esplicito nel protocollo; uscire/chiudere l'app prima del salvataggio può perdere le risposte non confermate. Per conflitti tra dispositivi il banner indica di riaprire il quiz; non si fa merge automatico. Gli endpoint richiedono la migrazione anche con UI disattivata. Per un rollback del percorso quiz occorre ridistribuire il client precedente; il flag UI da solo non cambia il protocollo di salvataggio.

Il nuovo snapshot non espone le soluzioni prima della correzione. Il vecchio endpoint/query di catalogo dell'app contiene già `questions.is_correct`: la chiusura completa di quella esposizione richiede un intervento separato sui quiz e non viene rivendicata da questa modifica.

## Rollback non distruttivo

Disattivare il flag UI se necessario e tornare al client precedente per problemi del nuovo protocollo. Conservare ledger, trigger e migrazione applicata: gli upsert precedenti restano supportati e non si elimina lo storico. I vecchi client non qualificano nuovi esami per il grado di preparazione finché non vengono aggiornati. Nessuna down migration distruttiva è inclusa.


## Correzione navigazione quiz

Ripristinato `previousDisabled={quiz.currentQuestionIndex === 0}` nella navigazione del quiz attivo. Il valore costante `true` inserito nel primo pacchetto disabilitava erroneamente il pulsante per tutte le domande. Il controllo resta separato dalla schermata risultati. Il test client ora verifica sia il movimento dell’hook sia la condizione JSX effettiva per gli indici 0, 1 e 29.


## Presentazione del voto e banner

Il voto esposto nel profilo, nella schermata statistiche, nelle componenti dell’indice e per la padronanza delle categorie è espresso da 1 a 10: `max(1,min(10,score/10))`, con al massimo un decimale localizzato. Esempio: 83 interno → 8,3/10. I dati insufficienti restano «—». Accuratezza e copertura in percentuale, errori e numero di risposte mantengono le loro unità. La scala interna SQL resta 0–100; nessuna modifica a formula, soglie o migrazioni.

`QuizSaveStatus` restituisce sempre `null`, anche per errori: nessun banner di salvataggio viene visualizzato e nessuno spazio viene occupato. La logica di salvataggio e gli stati degli hook restano attivi. Questo aggiornamento sostituisce la descrizione precedente del banner/retry visibile. Per richiesta esplicita, gli errori di scrittura non mostrano più un pulsante Riprova nel quiz; gli errori di lettura iniziale del progresso conservano una schermata di errore con Riprova, così il quiz non diventa una pagina vuota.
