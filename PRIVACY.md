# Informativa sulla Privacy (Privacy Policy)

**Ultimo aggiornamento: 15 Ottobre 2026**

La presente informativa descrive le modalità di trattamento dei dati personali degli utenti del servizio **Quiz Patente**, fruibile tramite il sito ufficiale [quizpatenteitaliana.it](https://quizpatenteitaliana.it) (inclusi i sottodomini per lingua, ad esempio `es.quizpatenteitaliana.it` e `bn.quizpatenteitaliana.it`) e attraverso le relative applicazioni mobili, redatta in conformità al Regolamento Generale sulla Protezione dei Dati (UE) 2016/679 (**GDPR**) e al D.Lgs. 196/2003 (Privacy Code).

---

### 1. Titolare del Trattamento
Il titolare del trattamento dei dati è il gestore del servizio **Quiz Patente**, raggiungibile tramite il sito ufficiale [https://quizpatenteitaliana.it](https://quizpatenteitaliana.it). Per qualsiasi richiesta relativa ai dati personali è possibile contattare il titolare attraverso i canali indicati sul sito.

---

### 2. Dati Personali Trattati
L'applicazione raccoglie e tratta esclusivamente i dati strettamente necessari per l'erogazione delle funzionalità didattiche:

- **Dati di Registrazione**: Indirizzo email e password (protetta da hash cifrato), gestiti tramite Supabase Auth. La registrazione è limitata a indirizzi email appartenenti a domini autorizzati.
- **Preferenze di Configurazione**: Lingua primaria e lingua secondaria selezionate per l'interfaccia e per la traduzione dei quiz.
- **Dati di Apprendimento**: Storico delle risposte fornite, punteggi conseguiti nei quiz e nelle simulazioni d'esame, registro degli errori commessi (per consentire la funzione di revisione errori e il monitoraggio dei progressi personali).
- **Conversazioni con l'AI**: Messaggi inviati alla chat testuale e trascrizioni delle conversazioni vocali, conservati per permettere la continuazione della conversazione e la consultazione dello storico.
- **Identificativo di Dispositivo**: Un identificativo aleatorio (non un identificativo pubblicitario) generato localmente sul dispositivo, utilizzato per garantire che un account possa essere utilizzato su un solo dispositivo alla volta e per proteggere l'account da accessi non autorizzati.
- **Dati di Sessione**: La sessione di accesso viene conservata localmente sul dispositivo (localStorage/AsyncStorage) per evitare dover inserire le credenziali ad ogni avvio.

---

### 3. Funzionalità basate su Intelligenza Artificiale
Alcune funzioni del servizio (spiegazioni delle domande, chat testuale e chat vocale) sono alimentate da modelli di intelligenza artificiale. A tale fine:

- Il testo delle domande, delle richieste e delle conversazioni viene inviato, tramite i nostri server, al fornitore del modello AI (**Google Gemini API**).
- Le funzioni di chat vocale comportano la **trasmissione dell'audio del microfono** al fornitore AI esclusivamente per la durata della conversazione vocale attiva dall'utente. L'audio non viene registrato né conservato da noi: vengono conservate soltanto le trascrizioni testuali della conversazione.
- I contenuti del servizio vengono elaborati per generare risposte rilevanti anche mediante tecnologie di embedding presso **Cloudflare Workers AI**.

I dati inviati ai fornitori di AI sono utilizzati esclusivamente per generare la risposta richiesta e non per finalità pubblicitarie o di profilazione commerciale.

---

### 4. Finalità e Base Giuridica
I dati personali vengono raccolti e utilizzati esclusivamente per:
1. Consentire l'accesso sicuro all'account e la sincronizzazione del percorso di studio.
2. Personalizzare le simulazioni d'esame e le sessioni di ripasso mirate sugli errori dell'utente.
3. Erogare le funzionalità di chat testuale e vocale su richiesta esplicita dell'utente.
4. Proteggere l'account e garantire la stabilità, la sicurezza e l'integrità del servizio.

**Base giuridica**: esecuzione del servizio espressamente richiesto dall'utente (art. 6, par. 1, lett. b GDPR) e legittimo interesse del titolare alla sicurezza del servizio (art. 6, par. 1, lett. f GDPR). L'utilizzo delle funzionalità AI e della chat vocale avviene su iniziativa volontaria dell'utente.

---

### 5. Condivisione dei Dati con Fornitori (Sub-Processors)
Per erogare il servizio il titolare si avvale di fornitori tecnici selezionati, che trattano dati per suo conto in qualità di responsabili del trattamento:

- **Supabase**: autenticazione, database, storage e API del servizio (infrastruttura nell'Unione Europea).
- **Google**: elaborazione AI testuale e vocale (Gemini API).
- **Cloudflare**: elaborazione di embedding per la ricerca semantica dei contenuti.

Tali fornitori trattano i dati secondo le proprie policy e secondo accordi di trattamento conformi al GDPR. **Nessun dato personale degli utenti è in alcun caso ceduto, venduto o utilizzato a fini pubblicitari o di profilazione commerciale.** Il servizio non incorpora strumenti di analytics, advertising o tracciamento di terze parti.

---

### 6. Conservazione dei Dati
I dati rimangono associati al profilo dell'utente fino alla cancellazione dell'account. A seguito della cancellazione, tutti i dati personali associati (profilo, progressi, errori, conversazioni e identificativo dispositivo) vengono eliminati definitivamente e in modo irreversibile.

---

### 7. Diritti dell'Utente e Cancellazione
Ai sensi degli artt. 15-22 del GDPR, l'utente può in qualsiasi momento:
- Accedere ai propri dati o chiederne la rettifica.
- Richiedere la limitazione del trattamento o l'opposizione.
- **Eliminare l'account e tutti i dati**: l'utente può procedere in completa autonomia e in tempo reale alla cancellazione definitiva di account, cronologia, progressi, errori e conversazioni direttamente dall'app, tramite la voce **"Elimina account"** nelle impostazioni del profilo.

In caso di dubbio o reclamo, l'utente ha il diritto di proporre reclamo all'autorità di controllo competente (**Garante per la protezione dei dati personali**, [www.garanteprivacy.it](https://www.garanteprivacy.it)).

---

### 8. Dati dei Minori
Il servizio è rivolto alla preparazione dell'esame teorico di patente di guida e non è destinato a minori di 14 anni. Qualora l'utente abbia un'età inferiore alla maggiore età, l'utilizzo del servizio è consentito solo con l'autorizzazione del titolare della responsabilità genitoriale.

---

### 9. Sicurezza del Trattamento
Adottiamo misure tecniche e organizzative adeguate al rischio: crittografia TLS/SSL in transito, cifratura dei dati a riposo, hashing delle password, limitazione dell'accesso ai dati strettamente necessari e legamento dell'account a un singolo dispositivo.

---

### 10. Cookie e Tecnologie Locali
La versione web del servizio utilizza esclusivamente tecnologie di archiviazione locale (localStorage) necessarie al mantenimento della sessione di accesso e alle preferenze. Non vengono utilizzati cookie di tracciamento, cookie pubblicitari o strumenti di profilazione.

---

### 11. Aggiornamenti
Eventuali modifiche alla presente informativa saranno pubblicate all'interno dell'applicazione e su questa pagina con indicazione della data di aggiornamento.
