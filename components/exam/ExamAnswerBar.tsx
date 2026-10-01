import { ThemedText } from '@/components/ThemedText';
import { useQuizColors } from '@/hooks/useQuizColors';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

interface ExamAnswerBarProps {
  hasAnswered: boolean;
  userAnswer?: boolean;
  onAnswer: (value: boolean) => void;
}

/** Sticky exclusive-selection bar: answering auto-advances to the next question. */
export function ExamAnswerBar({ hasAnswered, userAnswer, onAnswer }: ExamAnswerBarProps) {
  const { t } = useTranslation();
  const { cardBackgroundColor, borderColor } = useQuizColors();

  const falseSelected = hasAnswered && userAnswer === false;
  const trueSelected = hasAnswered && userAnswer === true;

  return (
    <View style={[styles.stickyAnswerBar, { backgroundColor: cardBackgroundColor, borderTopColor: borderColor }]}>
      <View style={styles.answerButtons}>
        <Pressable
          style={({ pressed }) => [
            styles.answerButton,
            styles.falseButton,
            pressed && styles.answerButtonPressed,
            falseSelected && styles.selectedFalseButton,
          ]}
          onPress={() => onAnswer(false)}
        >
          <Ionicons name="close-circle" size={32} color={falseSelected ? '#fff' : '#DC2626'} />
          <ThemedText style={[styles.answerButtonText, { color: falseSelected ? '#fff' : '#DC2626' }]}>
            {t('exam.false')}
          </ThemedText>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.answerButton,
            styles.trueButton,
            pressed && styles.answerButtonPressed,
            trueSelected && styles.selectedTrueButton,
          ]}
          onPress={() => onAnswer(true)}
        >
          <Ionicons name="checkmark-circle" size={32} color={trueSelected ? '#fff' : '#059669'} />
          <ThemedText style={[styles.answerButtonText, { color: trueSelected ? '#fff' : '#059669' }]}>
            {t('exam.true')}
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stickyAnswerBar: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderTopWidth: 1 },
  answerButtons: { flexDirection: 'row', gap: 12 },
  answerButton: {
    flex: 1,
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    borderWidth: 2,
  },
  answerButtonPressed: { opacity: 0.75, transform: [{ scale: 0.97 }] },
  trueButton: { backgroundColor: '#F0FDF4', borderColor: '#86EFAC' },
  falseButton: { backgroundColor: '#FFF1F2', borderColor: '#FECDD3' },
  selectedTrueButton: { backgroundColor: '#059669', borderColor: '#059669' },
  selectedFalseButton: { backgroundColor: '#DC2626', borderColor: '#DC2626' },
  answerButtonText: { fontSize: 18, fontWeight: '700' },
});
