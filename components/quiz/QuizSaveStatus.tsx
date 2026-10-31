import { Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';

export function QuizSaveStatus({ state, onRetry }: { state: 'saved' | 'pending' | 'error'; onRetry: () => unknown }) {
  const { t } = useTranslation();
  if (state === 'saved') return null;
  return <ThemedView style={styles.banner} accessibilityLiveRegion="polite">
    <ThemedText>{t(`statistics.save.${state}`)}</ThemedText>
    {state === 'error' && <Pressable accessibilityRole="button" onPress={() => { void onRetry(); }} style={({ pressed }) => [styles.retry, pressed && { opacity: 0.6 }]}>
      <ThemedText type="link">{t('statistics.retry')}</ThemedText>
    </Pressable>}
  </ThemedView>;
}
const styles = StyleSheet.create({ banner: { padding: 12, gap: 4 }, retry: { paddingVertical: 8 } });
