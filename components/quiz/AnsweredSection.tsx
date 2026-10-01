import { ThemedText } from '@/components/ThemedText';
import { useQuizColors } from '@/hooks/useQuizColors';
import { useQuizTheme } from '@/hooks/useQuizTheme';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

interface AnsweredSectionProps {
  isCorrect: boolean;
  userAnswer: boolean;
  questionIsCorrect: boolean;
  explanationEnabled: boolean;
  chatExplanationEnabled: boolean;
  showChatAI: boolean;
  onAskAI: () => void;
  explanation: string;
  explanationLoading: boolean;
  onFetchExplanation: () => void;
  onSpeakExplanation: () => void;
  secondaryExplanation: string | null;
  secondaryLanguageLabel: string;
  onSpeakSecondaryExplanation: () => void;
}

export function AnsweredSection({
  isCorrect,
  userAnswer,
  questionIsCorrect,
  explanationEnabled,
  chatExplanationEnabled,
  showChatAI,
  onAskAI,
  explanation,
  explanationLoading,
  onFetchExplanation,
  onSpeakExplanation,
  secondaryExplanation,
  secondaryLanguageLabel,
  onSpeakSecondaryExplanation,
}: AnsweredSectionProps) {
  const { t } = useTranslation();
  const quizTheme = useQuizTheme();
  const { textColor, iconColor, cardBackgroundColor, secondaryBackgroundColor, borderColor } =
    useQuizColors();

  const resultTheme = isCorrect ? quizTheme.passed : quizTheme.failed;

  return (
    <View style={styles.answeredSection}>
      <View
        style={[
          styles.answerResultCard,
          { backgroundColor: resultTheme.bg, borderColor: resultTheme.icon },
        ]}
      >
        <View style={styles.answerResultHeader}>
          <Ionicons
            name={isCorrect ? 'checkmark-circle' : 'close-circle'}
            size={26}
            color={resultTheme.errorLabel}
          />
          <ThemedText style={[styles.answerResultText, { color: resultTheme.errorLabel }]}>
            {isCorrect ? t('quiz.correctAnswer') : t('quiz.incorrectAnswer')}
          </ThemedText>
          {showChatAI && chatExplanationEnabled ? (
            <Pressable
              id="getAIChatExplanation"
              onPress={onAskAI}
              style={({ pressed }) => [
                styles.aiChatButton,
                pressed && { opacity: 0.7, transform: [{ scale: 0.96 }] },
              ]}
            >
              <Ionicons name="sparkles" size={14} color="#D97706" />
              <ThemedText style={styles.aiChatButtonText}>Chat AI</ThemedText>
            </Pressable>
          ) : null}
        </View>
        <ThemedText style={[styles.userAnswerText, { color: textColor }]}>
          {t('quiz.yourAnswer', { answer: userAnswer ? t('quiz.true') : t('quiz.false') })}
        </ThemedText>
        {!isCorrect ? (
          <ThemedText style={[styles.correctAnswerText, { color: iconColor }]}>
            {t('quiz.correctAnswerIs', { answer: questionIsCorrect ? t('quiz.true') : t('quiz.false') })}
          </ThemedText>
        ) : null}
      </View>

      {explanationEnabled ? (
        explanation ? (
          <View style={[styles.explanationCard, { backgroundColor: cardBackgroundColor }]}>
            <View style={[styles.explanationHeader, { borderBottomColor: borderColor }]}>
              <View style={styles.explanationBadge}>
                <Ionicons name="bulb" size={16} color="#F59E0B" />
                <ThemedText style={styles.explanationBadgeText}>{t('quiz.explanation')}</ThemedText>
              </View>
              <Pressable onPress={onSpeakExplanation} style={[styles.speakButtonSmall, { backgroundColor: secondaryBackgroundColor }]}>
                <Ionicons name="volume-high" size={18} color="#F59E0B" />
              </Pressable>
            </View>
            <ThemedText style={[styles.explanationText, { color: textColor }]}>{explanation}</ThemedText>
            {secondaryExplanation ? (
              <View style={[styles.secondaryLanguageCard, { backgroundColor: secondaryBackgroundColor, borderColor }]}>
                <View style={styles.secondaryHeader}>
                  <View style={[styles.languageBadge, { backgroundColor: borderColor }]}>
                    <ThemedText style={[styles.languageBadgeText, { color: iconColor }]}>
                      {secondaryLanguageLabel}
                    </ThemedText>
                  </View>
                  <Pressable onPress={onSpeakSecondaryExplanation} style={[styles.speakButtonSmall, { backgroundColor: borderColor }]}>
                    <Ionicons name="volume-high" size={18} color="#6B7280" />
                  </Pressable>
                </View>
                <ThemedText style={[styles.secondaryText, { color: iconColor }]}>{secondaryExplanation}</ThemedText>
              </View>
            ) : null}
          </View>
        ) : (
          <Pressable
            onPress={onFetchExplanation}
            disabled={explanationLoading}
            style={[styles.explainButtonMain, { borderColor: '#F59E0B' }]}
          >
            {explanationLoading ? (
              <ActivityIndicator size="small" color="#F59E0B" />
            ) : (
              <Ionicons name="sparkles" size={16} color="#F59E0B" />
            )}
            <ThemedText style={[styles.explainButtonText, { color: '#F59E0B' }]}>
              {explanationLoading ? t('quiz.loadingExplanation') : t('quiz.getExplanation')}
            </ThemedText>
          </Pressable>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  answeredSection: {
    gap: 14,
    marginBottom: 8,
  },
  answerResultCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
  },
  answerResultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  answerResultText: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
  },
  aiChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  aiChatButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#D97706',
  },
  userAnswerText: {
    fontSize: 15,
    marginBottom: 2,
  },
  correctAnswerText: {
    fontSize: 15,
    fontStyle: 'italic',
  },
  explanationCard: {
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  explanationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    marginBottom: 14,
  },
  explanationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 5,
  },
  explanationBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F59E0B',
  },
  explanationText: {
    fontSize: 15,
    lineHeight: 23,
  },
  secondaryLanguageCard: {
    marginTop: 14,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  secondaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  languageBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  languageBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  secondaryText: {
    fontSize: 15,
    lineHeight: 21,
  },
  explainButtonMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginTop: 8,
  },
  explainButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  speakButtonSmall: {
    padding: 5,
    borderRadius: 8,
  },
});
