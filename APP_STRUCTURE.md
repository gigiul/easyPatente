# EasyPatente - Struttura e Architettura del Progetto

Questo documento descrive in dettaglio la struttura delle cartelle e delle schermate dell'app EasyPatente, creata con **Expo React Native** (utilizzando **Expo Router**) e integrata con **Supabase** per l'autenticazione e i dati.

---

## 📂 Struttura delle Cartelle

La repository segue un'architettura modulare chiara e basata sui concetti tipici di React Native moderno:

- **`app/`**: Contiene tutte le schermate dell'applicazione e definisce il routing (grazie a Expo Router). Le cartelle con le parentesi come `(tabs)` designano Route Group che non si riflettono nell'URL, ma raggruppano logicamente le rotte o vi applicano un layout.
- **`components/`**: Componenti visivi riutilizzabili. Sono presenti varianti tematizzate per la Dark/Light Mode (es: `ThemedText`, `ThemedView`, `ThemedButton`) e Picker personalizzati.
- **`constants/`**: Valori costanti trasversali allo sviluppo (come i design token su `Colors.ts`).
- **`hooks/`**: Custom hooks React che contengono la logica di business. Qui avviene la comunicazione tra UI, Zustand stores e le chiamate Supabase (es: `useAuth`, `useCategories`, `useQuizQuestions`).
- **`queries/`**: Funzioni specifiche per eseguire query al database Supabase (separazione della query logic dal resto del frontend).
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
  - Carica le categorie dei quiz dal database (`useCategories`).
  - Mostra una griglia di pulsanti per ogni categoria tematica (con un sistema di colori per ogni card).
  - Al tap su una categoria, effettua un `router.push('/quizBatch')` delegando i parametri della categoria cliccata.
- **`app/(tabs)/user.tsx` (User Screen)**: 
  Schermata profilo utente.
  - Permette di modificare la **Lingua Primaria** (usata per l'interfaccia e la traduzione del quiz) e una **Lingua Secondaria** opzionale (con cui visualizzare testo parallelo nei quiz per utenti stranieri).
  - Gestisce l'aggiornamento simultaneo dell'UI via `i18n` e del profilo utente su database remoto.
  - Include il pulsante di configurazione e Logout.

### 3. Selezione Quiz Batch (Blocchi)
- **`app/quizBatch/index.tsx` (Quiz Batch Screen)**:
  - Recupera i blocchi di domande associati alla categoria selezionata (parametro `categoryId`) e allo stato di avanzamento utente (grazie all'hook `useQuizBatches`).
  - L'UI elenca i batch sotto forma di card indicando le metriche dello svolgimento ("Inizia", "In corso 5/30", "Completato").
  - Un tap porta l'utente dentro il quiz effettivo passandogli il `batchId`.

### 4. Svolgimento del Quiz Effettivo
- **`app/quiz.tsx` (Quiz Screen)**:
  - È la schermata più complessa contenente la _logica di business_ del testing (`useQuizQuestions`, `useQuizProgression`).
  - Gestisce la navigazione tra le domande mediante uno state `currentQuestionIndex`.
  - **Funzionalità incluse nella schermata**:
    - **Audio/TTS:** Integrazione con `expo-speech` per la lettura del testo tradotto.
    - **Supporto multi-lingua:** Visualizzazione contestuale della traduzione secondaria (se configurata).
    - **Progresso:** Barra a riempimento orizzontale posizionata sotto l'header.
    - **Azioni Interattive (Vero/Falso):** Una volta fornita la risposta, la logica invia il dato al DB (`updateQuizProgression`) e mostra dinamicamente la carta risultato (Corretto/Sbagliato) e un'eventuale _Explanation / Spiegazione_ con indicazione sonora e multi-lingua.
    - **Risultati Finali:** A quiz completato, calcola il punteggio in base alle risposte e lo mostra all'utente con un pulsante per "Riavviare" il quiz azzerando i progressi di quel batch nel database.

---

## 🧠 Flusso Dati (Data Flow & State Management)

1. I dati passano da database Supabase attraverso la cartella `queries/`.
2. Vengono elaborati/messi in cache all'interno della cartella `store/` utilizzando **Zustand**.
3. Gli strati della logica sono isolati nella directory `hooks/`, in cui viene consumato lo Store e incapsulata unicità della logica di business.
4. Ogni "pagina" in `app/` espone solo la View collegata a questi hooks. Questo pattern architetturale (Separation of Concerns tra UI component e State) garantisce grandissima facilità di manutenzione e mocking.
