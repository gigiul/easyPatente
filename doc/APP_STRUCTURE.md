# Quiz Patente 2026 - Struttura e Architettura del Progetto

Questo documento descrive in dettaglio la struttura delle cartelle e delle schermate dell'app Quiz Patente 2026, creata con **Expo React Native** (utilizzando **Expo Router**) e integrata con **Supabase** per l'autenticazione e i dati.

---

## 📂 Struttura delle Cartelle

La repository segue un'architettura modulare chiara e basata sui concetti tipici di React Native moderno:

- **`app/`**: Contiene tutte le schermate dell'applicazione e definisce il routing (grazie a Expo Router). Le cartelle con le parentesi come `(tabs)` designano Route Group che non si riflettono nell'URL, ma raggruppano logicamente le rotte o vi applicano un layout.
- **`components/`**: Componenti visivi riutilizzabili. Sono presenti varianti tematizzate per la Dark/Light Mode (es: `ThemedText`, `ThemedView`, `ThemedButton`) e Picker personalizzati.
- **`constants/`**: Valori costanti trasversali allo sviluppo (come i design token su `Colors.ts`).
- **`hooks/`**: Custom hooks React che contengono la logica di business. Qui avviene la comunicazione tra UI, Zustand stores e le chiamate Supabase (es: `useAuth`, `useCategories`, `useQuizQuestions`).
- **`queries/`**: Funzioni specifiche per eseguire query al database Supabase (separazione della query logic dal resto del frontend). Contiene moduli dedicati a progressione, errori (`mistakes.ts`) e dati generali.
- **`store/`**: Gestione dello state globale dell'app con **Zustand**. Ci sono store dedicati a settori logici (`user`, `languages`, `quizBatches`, `categories`, `quizQuestions`, `chat`, `voice`).
- **`i18n/`**: Configurazioni e file per la localizzazione (i18next). Contiene la cartella `locales` con i file JSON per le varie lingue (`it`, `en`, `es`, `bn`, ecc.).
- **`types/`**: Definizioni dei tipi TypeScript che descrivono i modelli dei dati in arrivo da Supabase e altre interfacce dell'app.
- **`lib/`**: File di libreria o configurazioni di root come `supabase.ts` (inizializzazione del client Supabase), `storage.ts` (storage locale/async con fallback `localStorage` su web), `alert.ts`/`alert.web.ts` (wrapper `AppAlert` per `Alert.alert` → `window.confirm` su web), `device.ts`/`auth.ts` e il layer vocale `liveVoice.ts` (session manager WS verso `functions/v1/live`) + `liveAudio.web.ts`/`liveAudio.ts` (cattura/playback audio PCM16 16 kHz, AudioWorklet su web, no-op su native).
- **`doc/`**: Documentazione (`APP_STRUCTURE.md`, `PROJECT.md`).

---

## 📱 Struttura delle Schermate (`app/`)

### 1. Autenticazione
- **`app/login.tsx`** & **`app/signup.tsx`**: 
  Schermate dedicate all'autenticazione. Gestiscono il login e la registrazione appoggiandosi all'hook `useAuth` e quindi a Supabase Auth.

### 2. Navigazione Principale (Tabs)
- **`app/(tabs)/_layout.tsx`**: 
  Funge da wrapper per la navigazione a "Bottom Tabs". 
- **`app/(tabs)/index.tsx` (Home Screen)**: 
  La dashboard principale dell'utente.
  - Carica le categorie dei quiz dal database passando la lingua corrente (`useCategories`).
  - Utilizza le traduzioni dinamiche (**`category_translations`**) per mostrare Titolo e Descrizione di ogni categoria.
  - Mostra una griglia di pulsanti per ogni categoria tematica, configurata per adattarsi dinamicamente ai colori e all'ordine definiti nel database (`sort_order`, `color`).
  - Al tap su una categoria, effettua un `router.push('/quizBatch')` passando l'ID della categoria.
- **`app/(tabs)/user.tsx` (User Screen)**: 
  Schermata profilo utente, riprogettata con una UI a card per una gestione "premium" delle preferenze.
  - **Impostazioni Lingua (Fulcro)**: Permette di modificare la **Lingua Primaria** (interfaccia e quiz) e una **Lingua Secondaria** opzionale (testo parallelo).
  - **Account**: Include badge per il piano (Premium/Free) e dati del profilo.
  - **Legale & Info**: Navigazione in-app verso **Privacy Policy** (`/privacy`), **Termini di Servizio** (`/terms`) e indicazione della versione dell'app (`v1.0.0`).
  - **Azioni di Sicurezza**: Gestisce Logout ed **Eliminazione Account** (tramite RPC `delete_user_account`).
- **`app/(tabs)/exam.tsx` (Exam Screen)**: 
  - Hub dedicato alle simulazioni d'esame.
  - Permette di generare un nuovo esame da 30 domande casuali collegate a un timer di 20 minuti, chiamando la RPC Supabase `generate_exam_batch`.
  - **Revisione Errori**: Include una sezione dinamica che mostra il numero di errori accumulati negli esami precedenti. Un pulsante dedicato permette di avviare un quiz di revisione personalizzato (limitato alle ultime 30 domande per simulare un esame reale) basato sulla tabella `user_mistakes`, utilizzando la RPC `generate_mistakes_review_batch`.
  - Mostra lo **"Storico Esami"** dell'utente (incluso le sessioni di revisione errori), con logica di ricalcolo del punteggio super ottimizzata interrogando direttamente via RPC (`get_user_exam_history`).
  - **Interfaccia Dinamica**: Include una sezione informativa collassabile per ottimizzare lo spazio e utilizza skeleton loaders per eliminare i layout shift durante il caricamento dello storico.
  - Carica i titoli dei batch dinamicamente mediante chiavi i18n memorizzate nel database, garantendo una localizzazione perfetta.

### 3. Selezione Quiz Batch (Blocchi)
- **`app/quizBatch/index.tsx` (Quiz Batch Screen)**:
  - Recupera i blocchi di domande associati alla categoria selezionata (parametro `categoryId`) e allo stato di avanzamento utente (grazie all'hook `useQuizBatches`).
  - I blocchi (Batch) sono chiamati genericamente **"Moduli"** (es. "Modulo 1", "Modulo 2") e numerati sequenzialmente in base all'ordine di creazione.
  - L'UI elenca i moduli sotto forma di card indicando le metriche dello svolgimento ("Inizia", "In corso 5/30", "Completato").
  - Un tap porta l'utente dentro il quiz effettivo passandogli il `batchId` e il titolo formattato.

### 4. Svolgimento del Quiz ed Esame
- **`app/quiz.tsx` (Quiz Screen)**:
  - È la schermata più complessa contenente la _logica di business_ del testing (`useQuizQuestions`, `useQuizProgression`).
  - Gestisce la navigazione tra le domande mediante uno state `currentQuestionIndex`.
  - **Funzionalità incluse nella schermata**:
    - **Audio/TTS:** Integrazione con `expo-speech` per la lettura del testo tradotto.
    - **Supporto multi-lingua:** Visualizzazione contestuale della traduzione secondaria (se configurata).
    - **Progresso:** Barra a riempimento orizzontale posizionata sotto l'header.
    - **Azioni Interattive (Vero/Falso):** Una volta fornita la risposta, la logica invia il dato al DB (`updateQuizProgression`) e mostra dinamicamente la carta risultato e la _Explanation_ (con lettura sonora/multi-lingua).
    - **Risultati Finali:** A quiz completato, calcola il punteggio in base alle risposte e lo mostra all'utente con design full-theme compatibile (`useQuizTheme`). 
- **`app/examQuiz.tsx` (Exam Quiz Screen)**:
  - Variante specializzata per la **Simulazione Esame Reale**.
  - Non mostra le spiegazioni né la correttezza della risposta durante lo svolgimento.
  - Integra un Timer rigoroso da 20 minuti con elaborazione di submit automatica allo scadere del tempo.
  - Mostra la schermata dei risultati al termine della simulazione (Superato/Non Superato con soglia max 3 errori) e l'elenco degli errori commessi con confronto tra risposta data e risposta corretta (senza spiegazioni/descrizioni aggiuntive).

### 5. Chat AI (testuale e vocale)
- **`app/(tabs)/chat.tsx`**:
  - Chat con l'assistente AI groundata sul manuale (Edge Function `chat`; visibile con flag `chat` + `profiles.has_ai`).
  - Bolle conversazionali, storico in `store/chat.ts` (`history`, `questionId`, `remainingRequests`), azione "pulisci chat".
  - **Modalità vocale** (flag `voice`, web-first): il tasto microfono avvia una sessione full-duplex
    (`lib/liveVoice.ts` → WS `functions/v1/live`); mentre è attiva la barra voce sostituisce l'input con
    lo stato live (connessione / ascolto / ricerca nel manuale / risposta) e le trascrizioni parziali
    vengono mostrate come bolle sintetiche; la sessione si stoppa uscendo dalla schermata (`useFocusEffect`).
  - Banner errore vocale tradotto (`voice.errors.*`) e contatore richieste residue condiviso con la chat testuale.
- **`app/quiz.tsx`**: da una domanda del quiz, "Chat AI" apre la chat **in modalità vocale con `question_id`**
  (fast-path cache del RAG) quando `voice` è attivo e il browser supporta l'audio; altrimenti mantiene il flusso testuale.

### 6. Schermate Legali
- **`app/terms.tsx`**: Termini e condizioni di servizio in italiano (esclusione di responsabilità, precisazione sulla revisione dei quiz didattici, conformità d'uso).
- **`app/privacy.tsx`**: Informativa sulla privacy sintetica in italiano (GDPR compliant, trasparenza sui dati raccolti ed eliminazione immediata account).

### 7. Supporto Web (Expo Web)
- **`app.config.ts`**: aggiunge `web: { bundler:'metro', output:'static', favicon }` e `dotenv` per `.env`/`.env.production` (via `APP_ENV`/`NODE_ENV`); `extra` espone `supabaseUrl`/`supabaseAnonKey`/`supabaseStorageUrl` per `Constants` su web.
- **`app/_layout.tsx`**: imposta `<title>Quiz Patente 2026</title>` via `expo-router/head` + `document.title` per la tab browser; `Stack` invariato.
- **`components/AppImageViewer.tsx` / `AppImageViewer.web.tsx`**: wrapper per `react-native-image-viewing` (manca build web) → su web `Modal`+`expo-image`.
- **`hooks/usePreventScreenCapture.ts` / `.web.ts`**: no-op su web (evita `UnavailabilityError` di `expo-screen-capture`).
- **`lib/alert.ts` / `alert.web.ts`**: `AppAlert.alert` → `Alert.alert` su native, `window.confirm/alert` su web (fix `logout`, `deleteAccount`, `clearChat`, `finishQuiz`).
- **`lib/storage.ts`**: mirror `AsyncStorage` ↔ `localStorage` su web.
- **`lib/supabase.ts`**: priorizza `Constants.expoConfig.extra` su `process.env` per coerenza web/native.
- **`metro.config.js`**: `unstable_enablePackageExports:false` + `babel.config.js` `babel-plugin-transform-import-meta` fix `zustand@5` `import.meta` su web.
- **`package.json`**: `web:export:dev` (`dotenv-cli -e .env`) e `web:export:prod` (`-e .env.production`) con `--clear && npx serve dist`.
----

## 🧠 Flusso Dati (Data Flow & State Management)

1. I dati passano da database Supabase attraverso la cartella `queries/`.
2. Vengono elaborati/messi in cache all'interno della cartella `store/` utilizzando **Zustand**.
3. Gli strati della logica sono isolati nella directory `hooks/`, in cui viene consumato lo Store e incapsulata unicità della logica di business.
4. Ogni "pagina" in `app/` espone solo la View collegata a questi hooks. Questo pattern architetturale (Separation of Concerns tra UI component e State) garantisce grandissima facilità di manutenzione e mocking.

## 🛠️ Funzioni RPC (Remote Procedure Calls)

Il progetto sfrutta le funzioni PostgreSQL eseguite lato DB (tramite `supabase.rpc()`) per isolare la logica complessa, garantire sicurezza tramite `SECURITY DEFINER` e ridurre le latenze. Le attuali procedure includono:

- **`delete_user_account()`**
  Elimina in modo sicuro un utente procedendo alla pulizia manuale dei suoi log di progressione (`user_quiz_progress`), degli errori registrati (`user_mistakes`) e del suo record `profiles`, per poi eliminare in modo nativo e definitivo la sua identità in `auth.users`. (Nota: Questa funzione è stata semplificata per evitare l'eliminazione accidentale di dati globali come le `questions` collegate ai blocchi esame o revisione).
- **`generate_exam_batch(p_user_id)`**
  Crea in automatico un nuovo esame prelevando 30 domande miste per argomento, le rimescola casualmente inserendole in un batch temporaneo e inizializza il `user_quiz_progress`. Memorizza la chiave i18n (`exam.title`) per il titolo del batch.
- **`generate_mistakes_review_batch()`**
  Verifica se un utente ha commesso errori storici e genera un batch di tipo `'exam'` (per apparire nello storico) contenente il set delle ultime 30 domande errate (o meno se il totale è inferiore), pronte da ripassare sotto forma di simulazione. Memorizza la chiave i18n (`exam.reviewTitle`) per il titolo.
- **`record_exam_mistakes(p_batch_id)`**
  Trigger automatico alla consegna di un esame. Scansiona le risposte: le errate o non fornite vengono aggregate in `user_mistakes`. Se una domanda precedentemente errata viene corretta in una sessione di revisione, essa viene rimossa dalla lista degli errori.
- **`get_mistakes_count()`**
  Ritorna istantaneamente un contatore aggiornato (count query) degli ultimi errori accumulati per l'utente loggato, per le badge visive UI.
- **`get_user_exam_history(p_user_id)`**
  Restituisce lo storico completo degli esami e delle revisioni errori (`batch_type` in `'exam'`, `'review'`) del singolo utente. Aggrega punteggio, numero errori e totale domande ricalcolandoli in tempo reale. Include il campo `title` (chiave i18n) per la localizzazione dinamica nel frontend.
- **`check_registration_email_domain()` / `handle_new_user()`**
  Hook pre e post-registrazione. Assicurano che i domini e-mail rispettino whitelist (es. bloccano spammer) tramite trigger DB, e creano nativamente l'anagrafica (`public.profiles`) reattiva.
- **`register_device(p_device_id)`**
  Registra il dispositivo corrente per l'utente autenticato. Utilizzata durante la registrazione di un nuovo account per associare l'account al dispositivo.
- **`validate_device(p_device_id)`**
  Verifica che il dispositivo corrente corrisponda a quello registrato per l'utente. Restituisce `true` se valido o se è il primo accesso (nessun dispositivo registrato). Utilizzata durante il login per negare l'accesso da dispositivi non autorizzati.
- **`reset_device_association(p_user_id)`**
  Rimuove l'associazione dispositivo per un utente specifico. Utilizzata dal servizio clienti per permettere all'utente di registrare un nuovo dispositivo.
- **`unlink_device()`**
  Rimuove l'associazione del dispositivo per l'utente corrente.
- **`match_manual_chunks(query_embedding, match_count, filter_language, filter_category_id)`**
  Retrieval vettoriale sui frammenti del manuale (`pgvector`, coseno su `embedding vector(768)`), opzionalmente
  ristretto a una categoria. Usato dal percorso "cosine" di `explain-question` e `chat`.
- **`match_chunks_by_sign(p_sign_name, p_query_embedding, p_match_count, p_filter_language)`**
  Percorso "sign": se `p_sign_name` è valorizzato restituisce i chunk indicati in `sign_to_chunk` (sezione
  esatta del segnale, `similarity = 1`); altrimenti ripiega sul coseno come `match_manual_chunks`.

## ⚡ Edge Functions (RAG)

Moduli condivisi in `supabase/functions/_shared/` (`env`, `cors`, `llm`, `embedding`, `retrieval`,
`guards`) usati dalle funzioni HTTP; la vocale (`live`) riusa `guards` + `retrieval`. Modello da
`GEMINI_MODEL` (DEV: `gemini-flash-lite-latest`), re-rank da `GEMINI_RERANK_MODEL`.
`explain-question` e `chat` sono **deployate su DEV**; `live` è al momento **solo locale**
(`supabase functions serve`).

- **`explain-question`** — spiegazione della domanda con retrieval ibrida:
  cache (`question_translations.explanation`) → Path A **sign-pinned** (`image_sign_type` ≠
  `NON_IDENTIFICATO` + categoria segnaletica) oppure Path B **cosine + filtro categoria** + **re-rank LLM**
  sul testo della domanda → generazione (con immagine) → cache. La risposta espone
  `retrieval_path`, `identified_sign`, `reranked`, `sections`, `has_image`, `from_cache`.
- **`chat`** — assistente conversazionale con rate limit (`has_ai`, `chat_daily_limit`); se il payload contiene
  `question_id` usa la stessa retrieval ibrida e inietta la spiegazione già cache di quella domanda, altrimenti
  parte dalla sola domanda utente. Risposta con `retrieval_path`/`reranked` e `remaining_requests`.
- **`live`** — proxy **WebSocket** verso Gemini Live API (`gemini-3.8-live`) per la chat vocale
  full-duplex: auth via `?access_token` (config `verify_jwt = false`), **RAG obbligatorio** tramite
  tool `retrieve_manual_context` (`behavior = BLOCKING`, senza re-rank), persistenza delle trascrizioni
  in `chat_messages` a ogni turno con consumo 1 richiesta/turno, history + custom vocabulary per l'ASR,
  cap sessione (`VOICE_SESSION_MAX_SECONDS`) e idle timeout (`VOICE_IDLE_SECONDS`).

## DB Schema SQL

CREATE TABLE public.categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  icon_url text,
  color text,
  sort_order integer,
  created_at timestamp with time zone DEFAULT now(),
  is_active boolean DEFAULT false,
  is_premium boolean NOT NULL DEFAULT false,
  CONSTRAINT categories_pkey PRIMARY KEY (id)
);
CREATE TABLE public.category_translations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL,
  lang_code text NOT NULL,
  title text NOT NULL,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT category_translations_pkey PRIMARY KEY (id),
  CONSTRAINT category_translations_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE,
  CONSTRAINT category_translations_lang_code_fkey FOREIGN KEY (lang_code) REFERENCES public.languages(code) ON DELETE CASCADE,
  CONSTRAINT category_translations_unique_cat_lang UNIQUE (category_id, lang_code)
);
CREATE TABLE public.languages (
  code text NOT NULL,
  name text NOT NULL,
  native_name text,
  is_active boolean DEFAULT true,
  is_default boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT languages_pkey PRIMARY KEY (code)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  lang_primary text,
  lang_secondary text,
  is_premium boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id),
  CONSTRAINT profiles_lang_primary_fkey FOREIGN KEY (lang_primary) REFERENCES public.languages(code),
  CONSTRAINT profiles_lang_secondary_fkey FOREIGN KEY (lang_secondary) REFERENCES public.languages(code)
);
CREATE TABLE public.question_translations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL,
  lang_code text NOT NULL,
  text text NOT NULL,
  explanation text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT question_translations_pkey PRIMARY KEY (id),
  CONSTRAINT question_translations_lang_code_fkey FOREIGN KEY (lang_code) REFERENCES public.languages(code),
  CONSTRAINT question_translations_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id)
);
CREATE TABLE public.questions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  image_filename text,
  is_free boolean NOT NULL DEFAULT true,
  category_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  is_correct boolean NOT NULL DEFAULT true,
  image_sign_type text, -- segnale identificato offline sull'immagine; 'NON_IDENTIFICATO' = nessun segnale (indice parziale)
  CONSTRAINT questions_pkey PRIMARY KEY (id),
  CONSTRAINT questions_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id)
);
CREATE TABLE public.quiz_batch_questions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  question_id uuid NOT NULL,
  position integer NOT NULL,
  CONSTRAINT quiz_batch_questions_pkey PRIMARY KEY (id),
  CONSTRAINT quiz_batch_questions_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.quiz_batches(id),
  CONSTRAINT quiz_batch_questions_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id)
);
CREATE TABLE public.quiz_batches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category_id uuid,
  is_random boolean NOT NULL DEFAULT false,
  batch_type text NOT NULL DEFAULT 'module',
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT quiz_batches_pkey PRIMARY KEY (id),
  CONSTRAINT quiz_batches_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id)
);
CREATE TABLE public.user_mistakes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  question_id uuid NOT NULL,
  incorrect_count integer DEFAULT 1,
  last_incorrect_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_mistakes_pkey PRIMARY KEY (id),
  CONSTRAINT user_mistakes_user_id_question_id_key UNIQUE (user_id, question_id),
  CONSTRAINT user_mistakes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT user_mistakes_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE CASCADE
);
CREATE TABLE public.user_quiz_progress (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  current_question integer NOT NULL DEFAULT 1,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed boolean NOT NULL DEFAULT false,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone,
  CONSTRAINT user_quiz_progress_pkey PRIMARY KEY (id),
  CONSTRAINT user_quiz_progress_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.quiz_batches(id),
  CONSTRAINT user_quiz_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.user_devices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_id text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_devices_pkey PRIMARY KEY (id),
  CONSTRAINT user_devices_user_id_unique UNIQUE (user_id),
  CONSTRAINT user_devices_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
-- Feature DEV (migrazione 20260924160100): mappa un segnale riconosciuto offline sul
-- capitolo del manuale. PK su sign_name, RLS SELECT per `authenticated`.
CREATE TABLE public.sign_to_chunk (
  sign_name     text PRIMARY KEY,   -- es. 'Divieto di sosta'
  sign_category text NOT NULL,      -- PERICOLO|PRECEDENZA|DIVIETO|OBBLIGO|INDICAZIONE|TEMPORANEO
  chunk_id      text NOT NULL,      -- percorso in manual_chunks, es. 'v1/cap-04/sez-33/001'
  keywords      text[],
  created_at    timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX idx_sign_to_chunk_category ON public.sign_to_chunk (sign_category);

---

## 🚀 Roadmap e Implementazioni Future

- **Device Binding (Associazione Account-Dispositivo)**:
  Ogni account è associato a un solo dispositivo alla volta per limitare la condivisione delle credenziali. Il dispositivo viene identificato tramite un ID univoco generato all'installazione e persistito in AsyncStorage. La validazione avviene lato server tramite RPC. Il servizio clienti può resettare l'associazione per permettere all'utente di registrare un nuovo dispositivo.

- **Tasto per segnalare problemi di traduzione/immagini**:
Si potrebbe aggiungere una tabella con le segnalazioni degli utenti con un limite di 1 segnalazione per domanda per utente. In questo modo si potrebbe implementare un sistema di feedback per migliorare la qualità delle traduzioni e delle immagini.

- **Maintenance mode**:
Implmentare un hook che nel caso venga flaggato a true un parametro nel db visualizzi una schermata di maintenance mode durante la quale non è possibile utilizzare l'app tranne per gli admin ( creare nuova colonna nella tabella profiles per flaggare gli admin )

- **AI Assistant Integrato (RAG)** — 🟡 implementato su **DEV**:
  Due **Supabase Edge Functions** (`explain-question` e `chat`) con **pgvector** (`manual_chunks.embedding vector(768)`)
  + moduli condivisi `_shared/`. Retrieval **ibrida**: per le domande con segnale identificato
  (`questions.image_sign_type` + `sign_to_chunk`) si aggancia alla sezione esatta del manuale, altrimenti
  coseno filtrato per categoria con **re-rank LLM**; le spiegazioni vengono cacheate in
  `question_translations.explanation`. La chat accetta `question_id` per contestualizzarsi alla domanda aperta.
  Restano da fare: promozione su PROD, evaluation estesa e test sui modelli di produzione (vedi
  `doc/EXECUTION_PLAN_RAG_IMAGES.md`).
- **Chat vocale full-duplex (Gemini Live API)** — 🟡 implementata in locale (deploy DEV pendente):
  Conversazione vocale in tempo reale (`gemini-3.8-live`) sempre groundata dal RAG tramite tool
  `retrieve_manual_context` (`behavior = BLOCKING`), con proxy Edge Function WS
  (`supabase/functions/live/`), web-first (AudioWorklet PCM16 in `lib/liveAudio.web.ts`), riuso di
  rate limit/history/UI della chat testuale (`store/voice.ts`, `lib/liveVoice.ts`, flag
  `feature_flags.voice` default `false` via migration `20260930100000_add_voice_feature_flag`).
  Piano completo con fasi ed exit criteria: `doc/PLAN_VOICE_CHAT.md`. Restano: test locale completo
  in browser, deploy DEV e attivazione esplicita del flag.
- **Statistiche Globali**:
  Dashboard analitica avanzata per tracciare le performance a lungo termine (progressione apprendimento, argomenti più falliti, percentuale probabilità di passare l'esame reale).

