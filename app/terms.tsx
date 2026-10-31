import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';

export default function TermsScreen() {
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
          Termini di Servizio
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
            {"1. Oggetto e Finalità del Servizio"}
          </ThemedText>
          <ThemedText style={styles.paragraph}>
            {"Quiz Patente (quizpatenteitaliana.it) è un servizio didattico progettato per assistere gli utenti nell'apprendimento e nella preparazione dell'esame teorico per la patente di guida italiana (Cat. A e B), offrendo quiz tematici, simulazioni d'esame, spiegazioni multilingua e strumenti di assistenza basati su intelligenza artificiale."}
          </ThemedText>
        </View>

        <View style={[styles.card, { backgroundColor: cardBackgroundColor, borderColor }]}>
          <ThemedText type="defaultSemiBold" style={[styles.sectionHeading, { color: accentColor }]}>
            {"2. Revisione e Miglioramento dei Quiz"}
          </ThemedText>
          <ThemedText style={styles.paragraph}>
            {"Tutti i quesiti, le opzioni di risposta, le traduzioni e le spiegazioni presenti nel servizio sono stati sottoposti a un processo autonomo di revisione, correzione, chiarimento e ottimizzazione didattica da parte del nostro team, al fine di facilitare l'apprendimento anche per gli studenti non madrelingua."}
          </ThemedText>
          <ThemedText style={[styles.paragraph, { marginTop: 8 }]}>
            {"Tuttavia, si precisa che l'unico testo ufficiale avente valore legale vincolante per gli esami di Stato è esclusivamente quello ministeriale pubblicato e aggiornato dal Ministero delle Infrastrutture e dei Trasporti."}
          </ThemedText>
        </View>

        <View style={[styles.card, { backgroundColor: cardBackgroundColor, borderColor }]}>
          <ThemedText type="defaultSemiBold" style={[styles.sectionHeading, { color: accentColor }]}>
            {"3. Funzionalità di Intelligenza Artificiale"}
          </ThemedText>
          <ThemedText style={styles.paragraph}>
            {"Le spiegazioni e la chat (testuale e vocale) sono generate automaticamente da intelligenza artificiale. Tali risposte sono puramente indicative e didattiche, possono contenere errori o informazioni non aggiornate e non costituiscono un sostituto dei materiali ministeriali ufficiali."}
          </ThemedText>
          <ThemedText style={[styles.paragraph, { marginTop: 6 }]}>
            {"L'accesso alle funzionalità AI può essere soggetto a un limite giornaliero di richieste."}
          </ThemedText>
        </View>

        <View style={[styles.card, { backgroundColor: cardBackgroundColor, borderColor }]}>
          <ThemedText type="defaultSemiBold" style={[styles.sectionHeading, { color: '#EF4444' }]}>
            {"4. Esclusione Totale di Responsabilità"}
          </ThemedText>
          <ThemedText style={styles.paragraph}>
            • <ThemedText style={styles.bold}>{"Nessuna garanzia di superamento: "}</ThemedText>
            {"L'applicazione è un mero strumento didattico ausiliario e non garantisce in alcun modo il superamento dell'esame ufficiale."}
          </ThemedText>
          <ThemedText style={[styles.paragraph, { marginTop: 6 }]}>
            • <ThemedText style={styles.bold}>{'Fornitura "Così com\'è" (As Is): '}</ThemedText>
            {"Il servizio e tutti i relativi contenuti, incluse le risposte generate da AI, sono forniti senza garanzie esplicite o implicite di totale assenza di errori, omissioni o refusi."}
          </ThemedText>
          <ThemedText style={[styles.paragraph, { marginTop: 6 }]}>
            • <ThemedText style={styles.bold}>{"Limitazione di responsabilità: "}</ThemedText>
            {"Il gestore del servizio e i suoi collaboratori non rispondono in alcun caso per esiti negativi degli esami, sanzioni, spese di reiscrizione ad autoscuole o qualunque danno diretto o indiretto derivante dall'uso dell'applicazione o dall'affidamento sui contenuti in essa presenti."}
          </ThemedText>
        </View>

        <View style={[styles.card, { backgroundColor: cardBackgroundColor, borderColor }]}>
          <ThemedText type="defaultSemiBold" style={[styles.sectionHeading, { color: accentColor }]}>
            {"5. Account Utente e Utilizzo Consentito"}
          </ThemedText>
          <ThemedText style={styles.paragraph}>
            {"La registrazione è limitata a indirizzi email di domini autorizzati. L'utente è l'unico responsabile della riservatezza delle proprie credenziali."}
          </ThemedText>
          <ThemedText style={[styles.paragraph, { marginTop: 6 }]}>
            {"Un account può essere utilizzato su un solo dispositivo alla volta. L'utilizzo del servizio è strettamente personale e non cedibile a terzi: è vietata la duplicazione, l'estrazione automatizzata (scraping) e la diffusione non autorizzata dei contenuti."}
          </ThemedText>
        </View>

        <View style={[styles.card, { backgroundColor: cardBackgroundColor, borderColor }]}>
          <ThemedText type="defaultSemiBold" style={[styles.sectionHeading, { color: accentColor }]}>
            {"6. Cancellazione, Modifiche e Legge Applicabile"}
          </ThemedText>
          <ThemedText style={styles.paragraph}>
            {"Puoi eliminare in qualsiasi momento il tuo account e tutti i dati associati tramite l'opzione \"Elimina account\" nella scheda Profilo, con cancellazione definitiva e immediata."}
          </ThemedText>
          <ThemedText style={[styles.paragraph, { marginTop: 6 }]}>
            {"Ci riserviamo il diritto di aggiornare o modificare i presenti Termini e le funzionalità del servizio in qualsiasi momento. I presenti Termini sono disciplinati dalla legge italiana; per i consumatori si applica il Codice del Consumo e il foro competente è quello del luogo di residenza del consumatore."}
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
