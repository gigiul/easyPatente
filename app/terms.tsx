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
          Ultimo aggiornamento: 29 Agosto 2026
        </ThemedText>

        <View style={[styles.card, { backgroundColor: cardBackgroundColor, borderColor }]}>
          <ThemedText type="defaultSemiBold" style={[styles.sectionHeading, { color: accentColor }]}>
            {"1. Oggetto e Finalità dell'App"}
          </ThemedText>
          <ThemedText style={styles.paragraph}>
            {"EasyPatente è un'applicazione didattica progettata per assistere gli studenti nell'apprendimento e nella preparazione dell'esame teorico per la patente di guida italiana (Cat. A e B), offrendo quiz tematici, simulazioni d'esame e spiegazioni didattiche multilingua."}
          </ThemedText>
        </View>

        <View style={[styles.card, { backgroundColor: cardBackgroundColor, borderColor }]}>
          <ThemedText type="defaultSemiBold" style={[styles.sectionHeading, { color: accentColor }]}>
            {"2. Revisione e Miglioramento dei Quiz"}
          </ThemedText>
          <ThemedText style={styles.paragraph}>
            {"Tutti i quesiti, le opzioni di risposta, le traduzioni e le spiegazioni presenti all'interno dell'applicazione sono stati sottoposti a un meticoloso processo autonomo di revisione, correzione, chiarimento e ottimizzazione didattica da parte del nostro team, al fine di facilitare l'apprendimento anche per gli studenti non madrelingua."}
          </ThemedText>
          <ThemedText style={[styles.paragraph, { marginTop: 8 }]}>
            {"Tuttavia, si precisa che l'unico testo ufficiale avente valore legale vincolante per gli esami di Stato è esclusivamente quello ministeriale pubblicato e aggiornato dal Ministero delle Infrastrutture e dei Trasporti."}
          </ThemedText>
        </View>

        <View style={[styles.card, { backgroundColor: cardBackgroundColor, borderColor }]}>
          <ThemedText type="defaultSemiBold" style={[styles.sectionHeading, { color: '#EF4444' }]}>
            {"3. Esclusione Totale di Responsabilità"}
          </ThemedText>
          <ThemedText style={styles.paragraph}>
            • <ThemedText style={styles.bold}>{"Nessuna garanzia di superamento: "}</ThemedText>
            {"L'applicazione è un mero strumento didattico ausiliario e non garantisce in alcun modo il superamento dell'esame ufficiale."}
          </ThemedText>
          <ThemedText style={[styles.paragraph, { marginTop: 6 }]}>
            • <ThemedText style={styles.bold}>{'Fornitura "Così com\'è" (As Is): '}</ThemedText>
            {"L'applicazione e tutti i relativi contenuti sono forniti senza garanzie esplicite o implicite di totale assenza di errori, omissioni o refusi."}
          </ThemedText>
          <ThemedText style={[styles.paragraph, { marginTop: 6 }]}>
            • <ThemedText style={styles.bold}>{"Limitazione di responsabilità: "}</ThemedText>
            {"Lo sviluppatore e i gestori di EasyPatente non rispondono in alcun caso per esiti negativi degli esami, sanzioni, spese di reiscrizione ad autoscuole o qualunque danno diretto o indiretto derivante dall'uso dell'applicazione o dall'affidamento sui contenuti in essa presenti."}
          </ThemedText>
        </View>

        <View style={[styles.card, { backgroundColor: cardBackgroundColor, borderColor }]}>
          <ThemedText type="defaultSemiBold" style={[styles.sectionHeading, { color: accentColor }]}>
            {"4. Account Utente e Utilizzo Consentito"}
          </ThemedText>
          <ThemedText style={styles.paragraph}>
            {"L'utente è l'unico responsabile della riservatezza delle proprie credenziali. L'utilizzo dell'applicazione è strettamente personale e non cedibile a terzi."}
          </ThemedText>
        </View>

        <View style={[styles.card, { backgroundColor: cardBackgroundColor, borderColor }]}>
          <ThemedText type="defaultSemiBold" style={[styles.sectionHeading, { color: accentColor }]}>
            {"5. Modifiche e Legge Applicabile"}
          </ThemedText>
          <ThemedText style={styles.paragraph}>
            {"Ci riserviamo il diritto di aggiornare o modificare i presenti Termini in qualsiasi momento. I presenti Termini sono disciplinati dalla legge italiana."}
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
