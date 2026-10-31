# Piano Implementazione: Monetizzazione Stripe per easyPatente

## Stato del Documento

- Versione: 1.0
- Data: 2026-09-04
- Stato: **CONFERMATO** - in attesa di implementazione

---

## 1. Analisi Situazione Attuale

| Componente | Stato Attuale |
|------------|---------------|
| **Auth** | Supabase Auth (email/password) + device binding (`user_devices`) |
| **Profilo utente** | Tabella `profiles` con `is_premium` (boolean), `has_ai`, `chat_daily_limit` |
| **Categorie premium** | Campo `is_premium` su `categories` + RLS che filtra via `is_premium()` |
| **Chat AI** | Richiede `profiles.has_ai = true` + feature flag `chat` attivo |
| **Edge Functions** | `chat`, `explain-question` (usano service role, auth via Bearer token) |
| **Ambienti** | DEV (`mvkx...`) e PROD (`pydw...`) separati con `.env` / `.env.production` |
| **State management** | Zustand (store: user, categories, chat, featureFlags, ecc.) |
| **Web/PWA/APK** | Stesso backend, stesso account Supabase |

### Punti di Ingresso per Monetizzazione

1. **Categorie bloccate** (`index.tsx`): quando `is_premium && !isUserPremium` → attualmente solo ritorno silenzioso, nessun CTA
2. **User profile** (`user.tsx`): mostra badge Free/Premium ma non ha gestione abbonamento
3. **Chat AI** (`chat.tsx`): se `!chatEnabled` per mancanza Premium → mostra solo "Non abilitato", nessun CTA upgrade
4. **Quiz spiegazioni** (`quiz.tsx`): spiegazioni AI bloccate senza prompt upgrade

---

## 2. Pricing Confermato

| Piano | Prezzo | Equivalente mensile | Risparmio vs mensile |
|-------|--------|---------------------|----------------------|
| Mensile | €10,00/mese | €10,00 | — |
| 6 mesi | €50,00 (pagamento unico) | €8,33/mese | €10,00 (17%) |

---

## 3. Funzionalità Premium (confermate)

| Funzionalità | Free | Premium |
|-------------|------|---------|
| Quiz categorie standard | ✅ | ✅ |
| Quiz categorie `is_premium` | ❌ (bloccate) | ✅ |
| Chat AI (`has_ai`) | ❌ | ✅ |
| Spiegazioni AI | ✅ | ✅ (non è premium) |
| Statistiche | ✅ | ✅ (non è premium) |
| Simulazioni esame | ✅ | ✅ (non è premium) |

---

## 4. Architettura Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                    STRIPE (Cloud)                                │
│  ┌──────────────┐ ┌──────────────────┐ ┌─────────────────────┐  │
│  │ Checkout Sess │ │ Customer Portal  │ │ Webhooks            │  │
│  │ (subscription)│ │ (gestione)       │ │ (eventi pagamento)  │  │
│  └──────┬───────┘ └────────┬─────────┘ └──────────┬──────────┘  │
└─────────┼──────────────────┼──────────────────────┼──────────────┘
          │                  │                      │
          │ redirect         │ redirect             │ POST
          ▼                  ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SUPABASE (Cloud)                              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Edge Functions (CORS)                       │    │
│  │  • create-checkout-session (auth)                       │    │
│  │  • stripe-webhook (no auth, verifica signature)         │    │
│  │  • create-portal-session (auth)                         │    │
│  └──────────────────────┬──────────────────────────────────┘    │
│                         │                                       │
│  ┌──────────────────────▼──────────────────────────────────┐    │
│  │                    Database                              │    │
│  │  profiles: stripe_customer_id, stripe_subscription_id,  │    │
│  │            subscription_status, subscription_current_    │    │
│  │            period_end, subscription_cancel_at_period_end │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                         │
                         │ Supabase Client (Bearer JWT)
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│               CLIENT (PWA / APK / Expo)                         │
│  ┌─────────────┐ ┌──────────────┐ ┌────────────────────────┐   │
│  │ useSubscription│ │ UpgradePrompt│ │ SubscriptionManager  │   │
│  │ (hook)      │ │ (componente) │ │ (gestione in-app)     │   │
│  └─────────────┘ └──────────────┘ └────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Modifiche Database

### Migration: `20260904000000_add_stripe_subscription.sql`

```sql
-- ============================================================
-- Aggiunta campi subscription a profiles
-- ============================================================

-- Campi Stripe
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS subscription_current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_cancel_at_period_end boolean DEFAULT false;

-- Validazione valori status
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_subscription_status_check
  CHECK (subscription_status IN ('none', 'active', 'past_due', 'canceled', 'incomplete'));

-- Indici per lookup webhook
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer
  ON public.profiles (stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_subscription
  ON public.profiles (stripe_subscription_id);

-- ============================================================
-- Aggiornamento funzione is_premium()
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_premium()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN COALESCE((
    SELECT subscription_status = 'active'
       OR subscription_status = 'past_due'
    FROM public.profiles
    WHERE id = auth.uid()
  ), false);
END;
$function$;

-- ============================================================
-- Tabella idempotenza webhook (opzionale, alternativa a lookup profiles)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.stripe_events_processed (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  processed_at timestamptz DEFAULT now()
);

ALTER TABLE public.stripe_events_processed ENABLE ROW LEVEL SECURITY;

-- Solo service role può accedere
CREATE POLICY "Service role only" ON public.stripe_events_processed
  FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
```

### Aggiornamento RLS su `profiles`

La policy `Users can update own profile securely` va aggiornata per permettere la modifica dei campi subscription:

```sql
DROP POLICY IF EXISTS "Users can update own profile securely" ON public.profiles;

CREATE POLICY "Users can update own profile securely" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    (auth.uid() = id)
    AND (
      -- Campi language: l'utente può modificare
      ((lang_primary IS NULL) OR (lang_primary IN (SELECT code FROM public.languages WHERE is_active = true)))
      AND ((lang_secondary IS NULL) OR (lang_secondary IN (SELECT code FROM public.languages WHERE is_active = true)))
      AND (
        -- L'utente NON può modificare i campi subscription
        -- (solo service_role / webhook può farlo)
        subscription_status = (SELECT p.subscription_status FROM public.profiles p WHERE p.id = auth.uid())
        AND stripe_customer_id = (SELECT p.stripe_customer_id FROM public.profiles p WHERE p.id = auth.uid())
        AND stripe_subscription_id = (SELECT p.stripe_subscription_id FROM public.profiles p WHERE p.id = auth.uid())
        AND subscription_current_period_end = (SELECT p.subscription_current_period_end FROM public.profiles p WHERE p.id = auth.uid())
        AND subscription_cancel_at_period_end = (SELECT p.subscription_cancel_at_period_end FROM public.profiles p WHERE p.id = auth.uid())
      )
    )
  );
```

---

## 6. Edge Functions

### 6.1 `create-checkout-session`

**Path**: `supabase/functions/create-checkout-session/index.ts`

**Endpoint**: `POST /functions/v1/create-checkout-session`

**Headers**:
```
Authorization: Bearer <supabase_jwt>
Content-Type: application/json
```

**Request Body**:
```json
{
  "price_id": "price_xxxxx",
  "platform": "web" | "native"
}
```

**Response 200**:
```json
{
  "sessionId": "cs_xxxxx",
  "url": "https://checkout.stripe.com/..."
}
```

**Logica**:
1. Autentica utente da Bearer JWT
2. Recupera profilo da `profiles` (includi `email`, `stripe_customer_id`)
3. Se non esiste `stripe_customer_id`:
   - Crea customer Stripe con `email`, `metadata: { user_id: auth.uid() }`
   - Salva `stripe_customer_id` su `profiles`
4. Crea Checkout Session (`mode: 'subscription'`):
   - `customer: stripe_customer_id`
   - `line_items: [{ price: price_id, quantity: 1 }]`
   - `subscription_data: { metadata: { user_id: auth.uid() } }`
   - `success_url`: basato su `platform`
     - `web` → `${NEXT_PUBLIC_APP_URL}/upgrade/success`
     - `native` → `easypatente://upgrade/success`
   - `cancel_url`: stessa logica con `/upgrade/cancel`
   - `client_reference_id: user_id`
   - `metadata: { user_id, platform }`
5. Restituisce `{ sessionId, url }`

**Variabili ambiente necessarie**:
- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_APP_URL` (dominio PWA per web)
- `STRIPE_PREMIUM_PRICE_ID_MONTHLY`
- `STRIPE_PREMIUM_PRICE_ID_6MONTHS`

---

### 6.2 `stripe-webhook`

**Path**: `supabase/functions/stripe-webhook/index.ts`

**Endpoint**: `POST /functions/v1/stripe-webhook`

**Headers**:
```
Stripe-Signature: <signature>
Content-Type: application/json
```

**Nessuna autenticazione Supabase** - verifica solo firma Stripe.

**Eventi Gestiti (idempotenti)**:

| Evento | Azione su `profiles` |
|--------|----------------------|
| `checkout.session.completed` | Imposta `subscription_status = 'active'`, salva `stripe_subscription_id`, `stripe_customer_id`, `subscription_current_period_end` |
| `customer.subscription.updated` | Aggiorna `subscription_status`, `subscription_current_period_end`, `subscription_cancel_at_period_end` |
| `customer.subscription.deleted` | Imposta `subscription_status = 'canceled'` |
| `invoice.payment_failed` | Imposta `subscription_status = 'past_due'` |
| `invoice.paid` (rinnovo) | Conferma `subscription_status = 'active'`, aggiorna `subscription_current_period_end` |

**Logica Webhook**:
```typescript
// Pseudocodice
serve(async (req) => {
  // 1. Verifica firma Stripe
  const sigHeader = req.headers.get("Stripe-Signature");
  const payload = await req.text();
  const event = stripe.webhooks.constructEvent(payload, sigHeader, WEBHOOK_SECRET);

  // 2. Idempotenza: controlla se già processato
  const { data: existing } = await supabase
    .from("stripe_events_processed")
    .select("event_id")
    .eq("event_id", event.id)
    .single();

  if (existing) return json({ received: true, duplicate: true });

  // 3. Processa evento
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(event.data.object);
      break;
    case "customer.subscription.updated":
      await handleSubscriptionUpdated(event.data.object);
      break;
    // ... altri eventi
  }

  // 4. Registra event_id per idempotenza
  await supabase.from("stripe_events_processed").insert({
    event_id: event.id,
    event_type: event.type,
  });

  return json({ received: true });
});
```

**Mapping stato Stripe → DB**:

| `subscription.status` (Stripe) | `subscription_status` (DB) |
|-------------------------------|---------------------------|
| `active` | `active` |
| `past_due` | `past_due` |
| `canceled` | `canceled` |
| `unpaid` | `past_due` |
| `incomplete` | `incomplete` |
| `incomplete_expired` | `incomplete` |
| `trialing` | `active` (non usiamo trial, ma gestiamo) |

**Variabili ambiente necessarie**:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

---

### 6.3 `create-portal-session`

**Path**: `supabase/functions/create-portal-session/index.ts`

**Endpoint**: `POST /functions/v1/create-portal-session`

**Request Body**:
```json
{
  "platform": "web" | "native"
}
```

**Response 200**:
```json
{
  "url": "https://billing.stripe.com/..."
}
```

**Logica**:
1. Autentica utente da Bearer JWT
2. Recupera `stripe_customer_id` da `profiles`
3. Crea Stripe Customer Portal Session:
   - `customer: stripe_customer_id`
   - `return_url`: basato su `platform`
     - `web` → `${NEXT_APP_URL}/user`
     - `native` → `easypatente://user`
4. Restituisce `{ url }`

**Funzionalità Portal** (configurate in Stripe Dashboard):
- ✅ Aggiornamento metodo di pagamento
- ✅ Visualizzazione storico fatture
- ✅ Download fatture PDF
- ✅ Cancellazione abbonamento (con accesso fino a fine periodo)
- ✅ Modifica piano (mensile ↔ 6 mesi)

---

## 7. Frontend - Struttura Nuovi Componenti

### 7.1 Nuovo Hook: `hooks/useSubscription.ts`

```typescript
interface SubscriptionState {
  // Stato
  status: 'none' | 'active' | 'past_due' | 'canceled' | 'incomplete' | 'loading';
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  isPremium: boolean;  // status === 'active' || status === 'past_due'

  // UI state
  loading: boolean;
  error: string | null;
  checkoutLoading: boolean;

  // Azioni
  refresh: () => Promise<void>;
  openCheckout: (priceId: string, platform: 'web' | 'native') => Promise<void>;
  openPortal: (platform: 'web' | 'native') => Promise<void>;
}
```

**Sostituisce** l'attuale `usePremiumStatus.ts` che legge `is_premium` dal profilo.

---

### 7.2 Nuovo Store: `store/subscription.ts`

Zustand store per stato globale condiviso tra tab Profilo, Home, Chat.

---

### 7.3 Tipi Aggiornati: `types/profiles.ts`

```typescript
export interface Profile {
  id: string;
  email?: string | null;
  lang_primary?: string | null;
  lang_secondary?: string | null;
  is_premium: boolean;                    // legacy, deprecato
  created_at: string;
  has_ai: boolean;

  // Campi subscription (nuovi)
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  subscription_status: 'none' | 'active' | 'past_due' | 'canceled' | 'incomplete';
  subscription_current_period_end?: string | null;
  subscription_cancel_at_period_end?: boolean;
}
```

---

### 7.4 Componenti UI

#### `UpgradePrompt.tsx` (componente riutilizzabile)

```typescript
interface UpgradePromptProps {
  trigger: 'category_lock' | 'chat_ai' | 'explanations' | 'profile';
  onDismiss?: () => void;
}
```

**Contenuto variabile per trigger**:

| Trigger | Titolo | Sottotitolo/Beneficio |
|---------|--------|----------------------|
| `category_lock` | "Sblocca tutte le categorie" | "Accedi a tutti i quiz della patente con Premium" |
| `chat_ai` | "Chat AI Personalizzata" | "Chiedi all'assistente AI e ricevi risposte su misura" |
| `explanations` | "Spiegazioni AI Avanzate" | "Ogni domanda con una spiegazione dettagliata" |
| `profile` | "Diventa Premium" | "Sblocca tutte le funzionalità" |

**Pulsanti piano**:
- "€10,00/mese - Mensile"
- "€50,00/6 mesi - Risparmi €10 (Recommended)"

**States**: loading spinner durante `openCheckout`, errore con retry.

---

#### `PremiumLockOverlay.tsx` (overlay su categorie bloccate)

Overlay leggero con:
- Icona lucchetto
- Testo "Premium"
- Tap → apre `UpgradePrompt`

---

#### `SubscriptionManager.tsx` (sezione nel profilo)

Stati visualizzati:

| Stato | UI |
|-------|-----|
| `none` | Badge "Free" + CTA "Diventa Premium" → UpgradePrompt |
| `active` | Badge "Premium attivo fino al DD/MM/YYYY" + "Gestisci abbonamento" → Portal |
| `past_due` | Badge "Pagamento in sospeso" + messaggio "Riproveremo a processare il pagamento" |
| `canceled` | Badge "Premium fino al DD/MM/YYYY" + "Cancellazione in corso - accesso fino al [data]" |
| `incomplete` | CTA "Completa l'acquisto" → riapre Checkout |

---

## 8. Entry Points - Modifiche ai File Esistenti

### 8.1 `app/(tabs)/index.tsx` (Home)

**Modifica** `handleCategoryPress`:

```typescript
// PRIMA (attuale)
const handleCategoryPress = (categoryId: string, isCategoryPremium: boolean) => {
  if (isCategoryPremium && !isUserPremium) return;  // ← ritorno silenzioso, nessun CTA

// DOPO (proposto)
const handleCategoryPress = (categoryId: string, isCategoryPremium: boolean) => {
  if (isCategoryPremium && !isUserPremium) {
    setShowUpgradePrompt(true);  // ← mostra modal UpgradePrompt
    return;
  }
  // ... navigazione rimane uguale
```

**Import**: aggiungere `UpgradePrompt` e `useSubscription`.

---

### 8.2 `app/(tabs)/user.tsx` (Profilo)

**Aggiungere sezione "Abbonamento"** tra "Lingua" e "Legale & Info":

```tsx
{/* ABONNAMENTO */}
<ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
  {t('user.sections.subscription')}
</ThemedText>
<View style={[styles.card, { backgroundColor: cardBackgroundColor, borderColor }]}>
  <SubscriptionManager />
</View>
```

`SubscriptionManager` mostra stato + azioni (Upgrade o Portal).

---

### 8.3 `app/(tabs)/chat.tsx` (Chat AI)

**Modifica** il blocco `if (!chatEnabled)`:

```typescript
// PRIMA (attuale)
if (!chatEnabled) {
  return (
    <ThemedView style={styles.container}>
      <View style={styles.centerContent}>
        <Ionicons name="lock-closed" size={48} color={iconColor} />
        <ThemedText>{t('chat.notEnabled')}</ThemedText>
      </View>
    </ThemedView>
  );
}

// DOPIU (proposto)
if (!chatEnabled) {
  return (
    <ThemedView style={styles.container}>
      <View style={styles.centerContent}>
        <Ionicons name="lock-closed" size={48} color={iconColor} />
        <ThemedText>{t('chat.notEnabled')}</ThemedText>
        <ThemedText style={[styles.subtitle, { color: secondaryTextColor }]}>
          {t('chat.upgradeToAccess')}
        </ThemedText>
        <UpgradePrompt trigger="chat_ai" />
      </View>
    </ThemedView>
  );
}
```

---

### 8.4 `app/quiz.tsx` (Quiz)

**Solo se** la feature flag `explanation` è attiva E l'utente è Free:
- Al tap sulla spiegazione AI → mostra `UpgradePrompt` inline

---

## 9. Variabili d'Ambiente

### Edge Functions (`.env.local` / `.env.production`)

```bash
# Stripe
STRIPE_SECRET_KEY=sk_test_xxxxx           # sk_live_xxxxx in produzione
STRIPE_WEBHOOK_SECRET=whsec_xxxxx         # da Stripe Dashboard > Webhooks
STRIPE_PREMIUM_PRICE_ID_MONTHLY=price_xxxxx
STRIPE_PREMIUM_PRICE_ID_6MONTHS=price_xxxxx

# Redirect URLs
NEXT_PUBLIC_APP_URL=https://easypatente.app  # dominio PWA
```

**Deploy**:
```bash
supabase secrets set \
  STRIPE_SECRET_KEY="sk_test_xxxxx" \
  STRIPE_WEBHOOK_SECRET="whsec_xxxxx" \
  STRIPE_PREMIUM_PRICE_ID_MONTHLY="price_xxxxx" \
  STRIPE_PREMIUM_PRICE_ID_6MONTHS="price_xxxxx" \
  NEXT_PUBLIC_APP_URL="https://easypatente.app"
```

### Client App (`.env` / `.env.production`)

```bash
# .env (DEV)
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx
EXPO_PUBLIC_STRIPE_PRICE_ID_MONTHLY=price_xxxxx
EXPO_PUBLIC_STRIPE_PRICE_ID_6MONTHS=price_xxxxx

# .env.production (PROD)
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxxxx
EXPO_PUBLIC_STRIPE_PRICE_ID_MONTHLY=price_xxxxx
EXPO_PUBLIC_STRIPE_PRICE_ID_6MONTHS=price_xxxxx
```

---

## 10. Sicurezza

| Rischio | Mitigazione |
|---------|------------|
| Chiave segreta Stripe esposta al client | Solo nelle Edge Functions (Supabase secrets) |
| Client dichiara di essere Premium | `is_premium()` legge `subscription_status` dal DB (RLS) |
| Webhook manomesso | Verifica firma Stripe (`stripe.webhooks.constructEvent`) |
| Evento webhook duplicato | Tabella `stripe_events_processed` con PK su `event_id` |
| Price ID manipolato dal client | `create-checkout-session` accetta `price_id` ma validare che sia tra quelli permessi |
| Customer Portal URL manomesso | Generato lato server con `return_url` controllato |
| Utente modifica campo subscription via API | RLS `WITH CHECK` impedisce modifica campi subscription da parte dell'utente |
| Replay attack su webhook | Idempotenza via `event_id` (jti) - ogni evento processato una sola volta |
| Manipolazione `profiles.is_premium` via client | Campi subscription (status, customer_id, ecc.) non modificabili dall'utente via RLS |

---

## 11. Flussi Utente Dettagliati

### 11.1 Acquisto Premium (Conversione)

```
1. Utente Free tocca categoria "Premium" bloccata
2. App mostra UpgradePrompt (modal):
   - Titolo: "Sblocca tutte le categorie"
   - Benefici: "Accedi a tutti i quiz + Chat AI"
   - Piano Mensile: "€10,00/mese"
   - Piano 6 mesi: "€50,00/6 mesi (risparmi €10)" [Recommended]
   - Pulsanti: [Mensile] [6 mesi]
3. Utente sceglie piano → openCheckout(priceId, platform)
4. Frontend chiama POST /functions/v1/create-checkout-session
   - Body: { price_id, platform }
5. Edge Function:
   a. Autentica utente (Bearer JWT)
   b. Crea/recupera Stripe Customer
   c. Crea Checkout Session con success_url/cancel_url corretto
   d. Restituisce { url }
6. Frontend reindirizza a { url } (Stripe Checkout in browser/modale)
7. Utente completa pagamento su Stripe
8. Stripe reindirizza a success_url:
   - Web: https://tuodominio.com/upgrade/success → mostra conferma
   - Native: easypatente://upgrade/success → deep link all'app → mostra conferma
9. NEL FRATTEMPO: Stripe invia webhook
10. Edge Function stripe-webhook riceve checkout.session.completed:
    a. Verifica firma
    b. Legge customer_id, subscription_id da evento
    c. Aggiorna profiles: subscription_status = 'active', salva campi
    d. Registra event_id in stripe_events_processed
11. Prossimo refresh dello store subscription → isPremium = true
12. Tutte le categorie Premium si sbloccano
```

### 11.2 Caso: Utente chiude browser prima del redirect

```
1. Utente completa pagamento su Stripe
2. Chiude browser SENZA attendere redirect
3. Stripe invia webhook come al punto 9 sopra
4. profiles si aggiorna correttamente
5. Prossimo accesso dell'utente:
   - Login → fetchProfile → subscription_status = 'active' → Premium
   - Nessuna azione richiesta
```

### 11.3 Gestione Abbonamento (Profilo)

```
1. Utente Premium apre tab Profilo
2. Sezione "Abbonamento" mostra: "Premium attivo fino al 15/10/2026"
3. Pulsante "Gestisci abbonamento"
4. Tap → POST /functions/v1/create-portal-session
5. Edge Function crea Stripe Portal Session
6. Frontend reindirizza a { url } (Portal Stripe)
7. L'utente può:
   - Aggiornare metodo pagamento
   - Visualizzare fatture
   - Scaricare fatture PDF
   - Cancellare abbonamento
8. Dopo operazione → return_url riporta all'app
```

### 11.4 Cancellazione

```
1. Utente cancella abbonamento da Portal
2. Stripe imposta: subscription.cancel_at_period_end = true
3. Webhook customer.subscription.updated → profiles.subscription_cancel_at_period_end = true
4. Accesso Premium continua fino a current_period_end
5. Al current_period_end:
   - Stripe invia customer.subscription.deleted
   - profiles.subscription_status = 'canceled'
   - L'utente perde accesso Premium
```

---

## 12. UX Messaggi per Stato

### Lingue

Le traduzioni vanno aggiunte a `i18n/locales/it.json` e `en.json`:

```json
{
  "subscription": {
    "title": "Abbonamento",
    "premiumActive": "Premium attivo fino al {{date}}",
    "premiumCanceled": "Premium fino al {{date}} (rinnovo annullato)",
    "pastDue": "Pagamento in sospeso - riproveremo a processarlo",
    "incomplete": "Completa l'acquisto per attivare Premium",
    "free": "Piano Free",
    "upgrade": "Diventa Premium",
    "manage": "Gestisci abbonamento",
    "upgradeToAccess": "Passa a Premium per accedere",
    "monthly": "{{price}}/mese - Mensile",
    "sixMonths": "{{price}}/6 mesi - Risparmi {{saving}}",
    "recommended": "Consigliato",
    "processing": "Reindirizzamento al pagamento...",
    "checkoutError": "Errore nell'avvio del pagamento. Riprova.",
    "portalError": "Errore nell'apertura del portale. Riprova.",
    "cancelSuccess": "Cancellazione confermata. Accesso attivo fino al {{date}}.",
    "categoryLocked": "Categoria Premium",
    "categoryLockedMessage": "Questa categoria richiede un abbonamento Premium",
    "chatNotEnabled": "Chat AI richiede Premium",
    "chatNotEnabledMessage": "Passa a Premium per accedere all'assistente AI"
  }
}
```

---

## 13. File da Creare

| File | Descrizione |
|------|-------------|
| `supabase/migrations/20260904000000_add_stripe_subscription.sql` | Migration DB |
| `supabase/functions/create-checkout-session/index.ts` | Checkout Session |
| `supabase/functions/stripe-webhook/index.ts` | Webhook handler |
| `supabase/functions/create-portal-session/index.ts` | Customer Portal |
| `hooks/useSubscription.ts` | Hook stato subscription |
| `store/subscription.ts` | Store Zustand subscription |
| `components/UpgradePrompt.tsx` | Modal/prompt upgrade |
| `components/PremiumLockOverlay.tsx` | Overlay categorie bloccate |
| `components/SubscriptionManager.tsx` | Gestione abbonamento nel profilo |
| `i18n/locales/it.json` | Traduzioni IT (aggiunte) |
| `i18n/locales/en.json` | Traduzioni EN (aggiunte) |

---

## 14. File da Modificare

| File | Modifica |
|------|----------|
| `types/profiles.ts` | Aggiungere campi subscription |
| `app/(tabs)/index.tsx` | `handleCategoryPress` → UpgradePrompt |
| `app/(tabs)/user.tsx` | Sezione abbonamento + SubscriptionManager |
| `app/(tabs)/chat.tsx` | UpgradePrompt per chat non abilitata |
| `app/quiz.tsx` | UpgradePrompt per spiegazioni (se feature flag) |
| `hooks/usePremiumStatus.ts` | Deprecato, sostituito da useSubscription |
| `app.config.ts` | Variabili `EXPO_PUBLIC_STRIPE_*` |
| `queries/user.ts` | Funzioni per fetch/refresh subscription |
| `.env` | Chiavi Stripe dev |
| `.env.production` | Chiavi Stripe prod |

---

## 15. Configurazione Stripe Dashboard

### Prodotto e Price

| Campo | Valore |
|-------|--------|
| Prodotto | "EasyPatente Premium" |
| Price mensile | €10,00/mese, ricorrente, recurring interval: `month` |
| Price 6 mesi | €50,00, ricorrente, recurring interval: `month` con `recurring.count: 6` |
| Metadata price | `app: easypatente`, `plan: premium` |

### Webhook

| Campo | Valore |
|-------|--------|
| Endpoint URL | `https://<PROJECT_REF>.supabase.co/functions/v1/stripe-webhook` |
| Events | `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.paid` |
| Signing secret | `whsec_xxxxx` → copiare in Supabase secrets |

### Customer Portal

| Campo | Valore |
|-------|--------|
| Business profile | Logo + nome app |
| Subscription updates | ✅ Consenti modifica piano |
| Cancellation | ✅ Consenti cancellazione (accesso fino a fine periodo) |
| Invoice history | ✅ Consenti visualizzazione e download |

---

## 16. Strategia di Testing

### Strumenti

- **Stripe CLI**: `stripe listen --forward-to localhost:54321/functions/v1/stripe-webhook` (per test locale con Supabase CLI)
- **Stripe Test Mode**: utilizzare chiavi `sk_test_*` / `pk_test_*`
- **Stripe Dashboard > Payments > Test**: simulare pagamenti, retry, cancellazioni
- **Card di test Stripe**:
  - Success: `4242 4242 4242 4242`
  - Fail: `4000 0000 0000 0002`
  - 3D Secure: `4000 0025 0000 3155`

### Test Cases

| # | Scenario | Risultato Atteso |
|---|----------|-----------------|
| 1 | Checkout completato (card success) | `subscription_status = 'active'` in profiles |
| 2 | Checkout abbandonato (chiudi browser) | Stato invariato, nessun record creato |
| 3 | Checkout con card fallita | Errore in checkout, nessun aggiornamento DB |
| 4 | Webhook ricevuto 2 volte stesso evento | Solo 1 elaborazione (idempotenza) |
| 5 | Rinnovo automatico (simulare scadenza) | `current_period_end` aggiornato, status rimane `active` |
| 6 | Pagamento fallito al rinnovo | Status → `past_due`, grace period 3 giorni |
| 7 | Grace period scaduto senza pagamento | Status → `canceled` |
| 8 | Cancellazione da Portal | `cancel_at_period_end = true`, accesso fino a fine periodo |
| 9 | Utente su device diverso (stesso account) | Stesso stato Premium |
| 10 | Utente su APK dopo acquisto su PWA | Stesso stato Premium |
| 11 | RLS: utente Free non può modificare `subscription_status` | Errore RLS |
| 12 | Deep link APK (`easypatente://upgrade/success`) | Apre app, mostra conferma |
| 13 | Redirect PWA (`https://dominio/upgrade/success`) | Mostra conferma in browser |

---

## 17. Sequenza Implementazione

| # | Step | Dipendenze |
|---|------|-----------|
| 1 | Migration DB (`20260904000000_add_stripe_subscription.sql`) | Nessuna |
| 2 | Configurazione Stripe Dashboard (prodotto, price, portal) | Nessuna |
| 3 | Chiavi Stripe in `.env` e Supabase secrets | Step 2 |
| 4 | Edge Function `create-checkout-session` | Step 3 |
| 5 | Edge Function `stripe-webhook` | Step 3 |
| 6 | Edge Function `create-portal-session` | Step 3 |
| 7 | Test Edge Functions con `stripe listen` | Step 4-6 |
| 8 | Tipi TypeScript aggiornati (`types/profiles.ts`) | Step 1 |
| 9 | Hook `useSubscription` + store `subscription.ts` | Step 8 |
| 10 | Componente `UpgradePrompt` | Step 9 |
| 11 | Componente `SubscriptionManager` | Step 9 |
| 12 | Componente `PremiumLockOverlay` | Step 9 |
| 13 | Integrazione `app/(tabs)/index.tsx` (Home) | Step 10, 12 |
| 14 | Integrazione `app/(tabs)/user.tsx` (Profilo) | Step 11 |
| 15 | Integrazione `app/(tabs)/chat.tsx` (Chat) | Step 10 |
| 16 | Integrazione `app/quiz.tsx` | Step 10 |
| 17 | Traduzioni IT/EN | Step 10-16 |
| 18 | Test completo in Test Mode | Step 1-17 |
| 19 | Deploy produzione (chiavi live) | Step 18 |
| 20 | Aggiornamento documentazione (`APP_STRUCTURE.md`, `PROJECT.md`) | Step 19 |
