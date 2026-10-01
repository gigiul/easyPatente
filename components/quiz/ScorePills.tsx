import { ThemedText } from '@/components/ThemedText';
import { useQuizTheme } from '@/hooks/useQuizTheme';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

interface ScorePillsProps {
  score: number;
  incorrectCount: number;
  totalQuestions: number;
  variant: 'passed' | 'failed';
}

export function ScorePills({ score, incorrectCount, totalQuestions, variant }: ScorePillsProps) {
  const { t } = useTranslation();
  const quizTheme = useQuizTheme();
  const { correct, incorrect, scoreBlue, scoreOrange } = quizTheme.scorePills;
  const scorePillTheme = variant === 'passed' ? scoreBlue : scoreOrange;
  const percentage = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;

  return (
    <View style={styles.scorePillsRow}>
      <View style={[styles.scorePill, { backgroundColor: correct.bg, borderColor: correct.border }]}>
        <Ionicons name="checkmark-circle" size={20} color={correct.icon} />
        <ThemedText style={[styles.scorePillValue, { color: correct.text }]}>{score}</ThemedText>
        <ThemedText style={[styles.scorePillLabel, { color: correct.text }]}>
          {t('quiz.results.correct')}
        </ThemedText>
      </View>
      <View style={[styles.scorePill, { backgroundColor: incorrect.bg, borderColor: incorrect.border }]}>
        <Ionicons name="close-circle" size={20} color={incorrect.icon} />
        <ThemedText style={[styles.scorePillValue, { color: incorrect.text }]}>{incorrectCount}</ThemedText>
        <ThemedText style={[styles.scorePillLabel, { color: incorrect.text }]}>
          {t('quiz.results.incorrect')}
        </ThemedText>
      </View>
      <View style={[styles.scorePill, { backgroundColor: scorePillTheme.bg, borderColor: scorePillTheme.border }]}>
        <Ionicons name={variant === 'passed' ? 'trophy' : 'bar-chart'} size={20} color={scorePillTheme.icon} />
        <ThemedText style={[styles.scorePillValue, { color: scorePillTheme.text }]}>{percentage}%</ThemedText>
        <ThemedText style={[styles.scorePillLabel, { color: scorePillTheme.text }]}>
          {t('quiz.results.scoreLabel')}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scorePillsRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 10,
  },
  scorePill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 4,
  },
  scorePillValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  scorePillLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
});
