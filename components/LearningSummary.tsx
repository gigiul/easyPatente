import { Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { formatLearningGrade } from '@/lib/learning';
import { useAuth } from '@/hooks/useAuth';
import { useLearningStats } from '@/hooks/useLearningStats';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';

export function LearningSummary() {
  const { session } = useAuth();
  const { data, loading, error } = useLearningStats(session?.user.id);
  const { t, i18n } = useTranslation();
  const router = useRouter();
  return <ThemedView lightColor="#F3F4F6" darkColor="#1F2937" style={styles.card}>
    <ThemedText type="defaultSemiBold">{t('statistics.title')}</ThemedText>
    <ThemedText>{error ? t('statistics.error') : loading ? t('statistics.loading') : data ? `${data.readiness.score === null ? '' : `${formatLearningGrade(data.readiness.score, i18n.language)} · `}${t(`statistics.states.${data.readiness.state}`)}` : t('statistics.states.collecting')}</ThemedText>
    <Pressable accessibilityRole="button" onPress={() => router.push('/statistics')} style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}>
      <ThemedText type="link">{t('statistics.open')}</ThemedText>
    </Pressable>
  </ThemedView>;
}
const styles = StyleSheet.create({ card: { padding: 16, borderRadius: 16, gap: 8, marginTop: 16 }, action: { paddingVertical: 8 } });
