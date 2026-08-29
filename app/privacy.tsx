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
          Ultimo aggiornamento: 29 Agosto 2026
        </ThemedText>

        <View style={[styles.card, { backgroundColor: cardBackgroundColor, borderColor }]}>
          <ThemedText type="defaultSemiBold" style={[styles.sectionHeading, { color: accentColor }]}>
            1. Titolare del Trattamento
          </ThemedText>
          <ThemedText style={styles.paragraph}>
            {"Il titolare del trattamento dei dati è il team di sviluppo di EasyPatente, conformemente al Regolamento Generale sulla Protezione dei Dati (UE) 2016/679 (GDPR)."}
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
        </View>

        <View style={[styles.card, { backgroundColor: cardBackgroundColor, borderColor }]}>
          <ThemedText type="defaultSemiBold" style={[styles.sectionHeading, { color: accentColor }]}>
            3. Finalità del Trattamento e Sicurezza
          </ThemedText>
          <ThemedText style={styles.paragraph}>
            {"I dati sono trattati esclusivamente per consentire l'erogazione del servizio di esercitazione, sincronizzare il profilo e garantire la sicurezza dell'app."}
          </ThemedText>
          <ThemedText style={[styles.paragraph, { marginTop: 6 }]}>
            • <ThemedText style={styles.bold}>{"Nessuna vendita di dati: "}</ThemedText>
            {"Nessun dato personale viene ceduto o venduto a soggetti terzi a scopo pubblicitario o commerciale."}
          </ThemedText>
          <ThemedText style={[styles.paragraph, { marginTop: 6 }]}>
            • <ThemedText style={styles.bold}>{"Server sicuri: "}</ThemedText>
            {"I dati sono protetti da crittografia standard di settore (TLS/SSL in transito e a riposo)."}
          </ThemedText>
        </View>

        <View style={[styles.card, { backgroundColor: cardBackgroundColor, borderColor }]}>
          <ThemedText type="defaultSemiBold" style={[styles.sectionHeading, { color: accentColor }]}>
            {"4. Diritti dell'Utente e Cancellazione"}
          </ThemedText>
          <ThemedText style={styles.paragraph}>
            {"In qualsiasi momento puoi richiedere l'accesso, la rettifica o la cancellazione dei tuoi dati personali."}
          </ThemedText>
          <ThemedText style={[styles.paragraph, { marginTop: 6 }]}>
            • <ThemedText style={styles.bold}>{"Cancellazione immediata: "}</ThemedText>
            {"Puoi eliminare in qualunque momento e direttamente dall'app il tuo account e tutti i dati associati (statistiche ed errori) tramite l'opzione "}
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
