import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';

export default function PrivacyScreen() {
  const router = useRouter();

  const backgroundColor = useThemeColor({}, 'background');
  const cardBackgroundColor = useThemeColor({ light: '#FFFFFF', dark: '#1F2937' }, 'background');
  const borderColor = useThemeColor({ light: '#E5E7EB', dark: '#374151' }, 'icon');
  const textColor = useThemeColor({}, 'text');
  const secondaryTextColor = useThemeColor({ light: '#6B7280', dark: '#9CA3AF' }, 'text');
  const accentColor = '#2563EB';

  return (
    <ThemedView style={[styles.container, { backgroundColor }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: borderColor, backgroundColor: cardBackgroundColor }]}>
        <Pressable
          style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.6 }]}
          onPress={() => router.back()}
          hitSlop={12}
        >
          <Ionicons name="arrow-back" size={24} color={textColor} />
        </Pressable>
        <ThemedText type="defaultSemiBold" style={styles.headerTitle}>
          Informativa sulla Privacy
        </ThemedText>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <ThemedText style={[styles.lastUpdated, { color: secondaryTextColor }]}>
          Ultimo aggiornamento: 15 Ottobre 2026
        </ThemedText>

        <View style={[styles.card, { backgroundColor: cardBackgroundColor, borderColor }]}>
          <ThemedText type="defaultSemiBold" style={[styles.sectionHeading, { color: accentColor }]}>
            1. Titolare del Trattamento
          </ThemedText>
          <ThemedText style={styles.paragraph}>
            {"Il titolare del trattamento dei dati è il gestore del servizio Quiz Patente (quizpatenteitaliana.it), conformemente al Regolamento Generale sulla Protezione dei Dati (UE) 2016/679 (GDPR). Per richieste relative ai dati personali è possibile contattare il titolare tramite il sito ufficiale."}
          </ThemedText>
        </View>

        <View style={[styles.card, { backgroundColor: cardBackgroundColor, borderColor }]}>
          <ThemedText type="defaultSemiBold" style={[styles.sectionHeading, { color: accentColor }]}>
            2. Dati Raccolti e Trattati
          </ThemedText>
          <ThemedText style={styles.paragraph}>
            {"L'applicazione raccoglie unicamente i dati necessari al funzionamento del servizio:"}
          </ThemedText>
          <ThemedText style={[styles.paragraph, { marginTop: 6 }]}>
            • <ThemedText style={styles.bold}>{"Autenticazione: "}</ThemedText>
            {"Indirizzo email e password cifrata (gestiti in modo sicuro tramite Supabase Auth)."}
          </ThemedText>
          <ThemedText style={[styles.paragraph, { marginTop: 6 }]}>
            • <ThemedText style={styles.bold}>{"Preferenze di Lingua: "}</ThemedText>
            {"Lingua primaria e secondaria selezionate per l'interfaccia e la traduzione dei quiz."}
          </ThemedText>
          <ThemedText style={[styles.paragraph, { marginTop: 6 }]}>
            • <ThemedText style={styles.bold}>{"Dati Didattici: "}</ThemedText>
            {"Storico risposte, punteggi nei quiz e registro errori (utilizzati per calcolare le statistiche e consentire la revisione mirata)."}
          </ThemedText>
          <ThemedText style={[styles.paragraph, { marginTop: 6 }]}>
            • <ThemedText style={styles.bold}>{"Conversazioni con l'AI: "}</ThemedText>
            {"Messaggi della chat testuale e trascrizioni delle conversazioni vocali."}
          </ThemedText>
          <ThemedText style={[styles.paragraph, { marginTop: 6 }]}>
            • <ThemedText style={styles.bold}>{"Identificativo di Dispositivo: "}</ThemedText>
            {"Un codice aleatorio generato sul dispositivo, utilizzato per garantire l'accesso da un solo dispositivo alla volta e proteggere l'account."}
          </ThemedText>
        </View>

        <View style={[styles.card, { backgroundColor: cardBackgroundColor, borderColor }]}>
          <ThemedText type="defaultSemiBold" style={[styles.sectionHeading, { color: accentColor }]}>
            3. Funzionalità di Intelligenza Artificiale
          </ThemedText>
          <ThemedText style={styles.paragraph}>
            {"Le spiegazioni delle domande e la chat (testuale e vocale) sono alimentate da intelligenza artificiale (Google Gemini)."}
          </ThemedText>
          <ThemedText style={[styles.paragraph, { marginTop: 6 }]}>
            • <ThemedText style={styles.bold}>{"Testo inviato all'AI: "}</ThemedText>
            {"Il contenuto delle domande e delle richieste viene inviato al fornitore AI per generare la risposta."}
          </ThemedText>
          <ThemedText style={[styles.paragraph, { marginTop: 6 }]}>
            • <ThemedText style={styles.bold}>{"Chat vocale: "}</ThemedText>
            {"L'audio del microfono è trasmesso esclusivamente per la durata della conversazione avviata da te; non viene registrato né conservato, vengono salvate solo le trascrizioni testuali nella chat."}
          </ThemedText>
        </View>

        <View style={[styles.card, { backgroundColor: cardBackgroundColor, borderColor }]}>
          <ThemedText type="defaultSemiBold" style={[styles.sectionHeading, { color: accentColor }]}>
            4. Finalità, Condivisione e Sicurezza
          </ThemedText>
          <ThemedText style={styles.paragraph}>
            {"I dati sono trattati esclusivamente per consentire l'erogazione del servizio di esercitazione, sincronizzare il profilo e garantire la sicurezza dell'app."}
          </ThemedText>
          <ThemedText style={[styles.paragraph, { marginTop: 6 }]}>
            • <ThemedText style={styles.bold}>{"Nessuna vendita di dati: "}</ThemedText>
            {"Nessun dato personale viene ceduto o venduto a soggetti terzi a scopo pubblicitario o commerciale. Il servizio non usa analytics, pubblicità o strumenti di tracciamento."}
          </ThemedText>
          <ThemedText style={[styles.paragraph, { marginTop: 6 }]}>
            • <ThemedText style={styles.bold}>{"Fornitori tecnici: "}</ThemedText>
            {"Supabase (infrastruttura, UE), Google (AI) e Cloudflare (elaborazione dei contenuti) trattano i dati come responsabili del trattamento."}
          </ThemedText>
          <ThemedText style={[styles.paragraph, { marginTop: 6 }]}>
            • <ThemedText style={styles.bold}>{"Server sicuri: "}</ThemedText>
            {"I dati sono protetti da crittografia standard di settore (TLS/SSL in transito e a riposo)."}
          </ThemedText>
        </View>

        <View style={[styles.card, { backgroundColor: cardBackgroundColor, borderColor }]}>
          <ThemedText type="defaultSemiBold" style={[styles.sectionHeading, { color: accentColor }]}>
            {"5. Diritti dell'Utente e Cancellazione"}
          </ThemedText>
          <ThemedText style={styles.paragraph}>
            {"In qualsiasi momento puoi richiedere l'accesso, la rettifica, la limitazione o la cancellazione dei tuoi dati personali (artt. 15-22 GDPR). In caso di reclamo puoi rivolgerti al Garante per la protezione dei dati personali (garanteprivacy.it)."}
          </ThemedText>
          <ThemedText style={[styles.paragraph, { marginTop: 6 }]}>
            • <ThemedText style={styles.bold}>{"Cancellazione immediata: "}</ThemedText>
            {"Puoi eliminare in qualunque momento e direttamente dall'app il tuo account e tutti i dati associati (profilo, statistiche, errori e conversazioni) tramite l'opzione "}
            <ThemedText style={styles.bold}>{'\"Elimina account\"'}</ThemedText>
            {" presente nella scheda Profilo."}
          </ThemedText>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 20,
  },
  lastUpdated: {
    fontSize: 13,
    marginBottom: 16,
    textAlign: 'center',
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 14,
    lineHeight: 22,
  },
  bold: {
    fontWeight: '700',
  },
});
