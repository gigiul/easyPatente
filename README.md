# easyPatente — App Mobile

App React Native (Expo) per la preparazione all'esame della patente italiana.

## Setup

```bash
npm install
npx expo start          # Dev server con hot reload
npm run build:preview   # Build nativa Android (preview)
npm run build:release   # Build nativa Android (production)
```

## Struttura

```
app/
  _layout.tsx        # Root layout + auth guard
  login.tsx          # Login
  signup.tsx         # Registrazione (con dominio email)
  quiz.tsx           # Quiz singolo (~1300 righe)
  quizBatch.tsx      # Selezione batch
  examQuiz.tsx       # Modalità esame
  (tabs)/
    index.tsx        # Home: categorie
    exam.tsx         # Tab esame
    user.tsx         # Profilo utente

hooks/               # 17 hooks React
queries/             # 7 moduli query Supabase
store/               # 6 store Zustand
lib/                 # supabase.ts, auth.ts, storage.ts, emailValidation.ts
types/               # Definizioni TypeScript (specchio DB)
i18n/                # Internazionalizzazione (13 lingue)
components/          # Componenti condivisi
```

## Architettura Dati

Flusso a tre strati: **Query → Hook → UI**

```
Supabase DB → queries/*.ts → store/*.ts (Zustand) → hooks/*.ts → app/*.tsx
```

## Autenticazione

- Supabase Auth (email + password)
- Sessione persistita in AsyncStorage
- Dominio email limitato (tabella `allowed_email_domains`)
- Auth guard in `_layout.tsx`: senza sessione → redirect a `/login`

## Funzionalità Chiave

- **Quiz V/F**: domande con spiegazioni AI (Edge Function `explain-question`)
- **Lingua doppia**: lingua primaria + secondaria (l'utente vede entrambe)
- **Image matching**: identificazione segnali stradali tramite similarità vettoriale
- **Cache spiegazioni**: una volta generata, la spiegazione è salvata nel DB
- **Simulazione esame**: modalità con limite errori
- **Text-to-speech**: ascolto domande/spiegazioni

## Variabili Ambiente

File `.env`:
```
EXPO_PUBLIC_SUPABASE_URL=https://...
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
EXPO_PUBLIC_SUPABASE_STORAGE_URL=...
```

## Dipendenze Principali

- `expo` ~55.0, `expo-router` ~55.0
- `@supabase/supabase-js` ^2.50
- `zustand` ^5.0
- `i18next` + `react-i18next`
- `expo-speech`, `expo-screen-capture`, `react-native-image-viewing`
