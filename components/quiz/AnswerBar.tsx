import { ThemedText } from '@/components/ThemedText';
import { useQuizColors } from '@/hooks/useQuizColors';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

interface AnswerBarProps {
  onAnswer: (value: boolean) => void;
}

export function AnswerBar({ onAnswer }: AnswerBarProps) {
  const { t } = useTranslation();
  const { iconColor, cardBackgroundColor, borderColor } = useQuizColors();

  return (
    <View style={[styles.stickyAnswerBar, { backgroundColor: cardBackgroundColor, borderTopColor: borderColor }]}>
      <ThemedText style={[styles.answerPrompt, { color: iconColor }]}>
        {t('quiz.selectAnswer')}
      </ThemedText>
      <View style={styles.answerButtons}>
        <Pressable
          style={({ pressed }) => [styles.answerButton, styles.falseButton, pressed && styles.answerButtonPressed]}
          onPress={() => onAnswer(false)}
        >
          <Ionicons name="close-circle" size={36} color="#DC2626" />
          <ThemedText style={[styles.answerButtonText, { color: '#DC2626' }]}>{t('quiz.false')}</ThemedText>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.answerButton, styles.trueButton, pressed && styles.answerButtonPressed]}
          onPress={() => onAnswer(true)}
        >
          <Ionicons name="checkmark-circle" size={36} color="#059669" />
          <ThemedText style={[styles.answerButtonText, { color: '#059669' }]}>{t('quiz.true')}</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stickyAnswerBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderTopWidth: 1,
  },
  answerPrompt: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  answerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  answerButton: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  answerButtonPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.97 }],
  },
  trueButton: {
    backgroundColor: '#F0FDF4',
    borderWidth: 2.5,
    borderColor: '#86EFAC',
  },
  falseButton: {
    backgroundColor: '#FFF1F2',
    borderWidth: 2.5,
    borderColor: '#FECDD3',
  },
  answerButtonText: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
