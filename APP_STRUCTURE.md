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
- **`store/`**: Gestione dello state globale dell'app con **Zustand**. Ci sono store dedicati a settori logici (`user`, `languages`, `quizBatches`, `categories`, `quizQuestions`).
- **`i18n/`**: Configurazioni e file per la localizzazione (i18next). Contiene la cartella `locales` con i file JSON per le varie lingue (`it`, `en`, `es`, `bn`, ecc.).
- **`types/`**: Definizioni dei tipi TypeScript che descrivono i modelli dei dati in arrivo da Supabase e altre interfacce dell'app.
- **`lib/`**: File di libreria o configurazioni di root come `supabase.ts` (inizializzazione del client Supabase) e `storage.ts` (storage locale/async).

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
  - **Account & Supporto**: Include badge per il piano (Premium/Free), link rapidi per contattare il **Supporto** e valutare l'app.
  - **Legale & Info**: Link a **Privacy Policy**, **Termini di Servizio** e indicazione della versione dell'app (`v1.0.0`).
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
- **`app/examQuiz/index.tsx` (Exam Quiz Screen)**:
  - Variante specializzata per la **Simulazione Esame Reale**.
  - Non mostra le spiegazioni né la correttezza della risposta durante lo svolgimento.
  - Integra un Timer rigoroso da 20 minuti con elaborazione di submit automatica allo scadere del tempo.
  - Mostra la schermata dei risultati solo al termine simulazione, indicando esito Superato/Non Superato in base al limite di 3 errori.
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
- **`record_batch_mistakes(p_batch_id)`**
  Procedura manuale per registrare errori da sessioni di quiz per categoria. Utilizza una logica di confronto booleano robusta per identificare le discrepanze tra risposta utente e risposta corretta.
- **`get_mistakes_count()`**
  Ritorna istantaneamente un contatore aggiornato (count query) degli ultimi errori accumulati per l'utente loggato, per le badge visive UI.
- **`get_user_exam_history(p_user_id)`**
  Restituisce lo storico completo degli esami e delle revisioni errori (`batch_type` in `'exam'`, `'review'`) del singolo utente. Aggrega punteggio, numero errori e totale domande ricalcolandoli in tempo reale. Include il campo `title` (chiave i18n) per la localizzazione dinamica nel frontend.
- **`check_registration_email_domain()` / `handle_new_user()`**
  Hook pre e post-registrazione. Assicurano che i domini e-mail rispettino whitelist (es. bloccano spammer) tramite trigger DB, e creano nativamente l'anagrafica (`public.profiles`) reattiva.

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

---

## 🚀 Roadmap e Implementazioni Future

- **Tasto per segnalare problemi di traduzione/immagini**:
Si potrebbe aggiungere una tabella con le segnalazioni degli utenti con un limite di 1 segnalazione per domanda per utente. In questo modo si potrebbe implementare un sistema di feedback per migliorare la qualità delle traduzioni e delle immagini.

- **Maintenance mode**:
Implmentare un hook che nel caso venga flaggato a true un parametro nel db visualizzi una schermata di maintenance mode durante la quale non è possibile utilizzare l'app tranne per gli admin ( creare nuova colonna nella tabella profiles per flaggare gli admin )

- **AI Assistant Integrato (RAG)**:
  Implementazione pianificata di un assistente virtuale basato su AI che funge da Tutor per la teoria della patente. L'AI utilizzerà la tecnica RAG (Retrieval-Augmented Generation) fruttando **Supabase Edge Functions** e **pgvector** per ricercare nel database relazionale (o vettoriale) estratti esatti del Manuale di Teoria, in modo da poter fornire risposte ragionate, di contesto, prive di allucinazioni e pertinenti alle vere simulazioni d'esame.
- **Statistiche Globali**:
  Dashboard analitica avanzata per tracciare le performance a lungo termine (progressione apprendimento, argomenti più falliti, percentuale probabilità di passare l'esame reale).

