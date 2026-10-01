import GifImage from '@/components/GifImage';
import { ThemedText } from '@/components/ThemedText';
import { useQuizColors } from '@/hooks/useQuizColors';
import type { QuizQuestion } from '@/store/quizQuestions';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

interface ErrorListItemProps {
  index: number;
  question: QuizQuestion;
  userAnswer: boolean;
  url: string | null;
  explanationEnabled: boolean;
  /** Present only when explanations are available (quiz mode). */
  explanation?: string;
  explanationLoading?: boolean;
  onFetchExplanation?: (question: QuizQuestion) => void;
  secondaryText: string | null;
  secondaryExplanation?: string | null;
  secondaryLanguageLabel: string;
  /** Color of the numbered badge (blue by default, green in exam mode). */
  accentColor?: string;
  questionNumberOfLines?: number;
}

function ErrorListItemBase({
  index,
  question,
  userAnswer,
  url,
  explanationEnabled,
  explanation = '',
  explanationLoading = false,
  onFetchExplanation,
  secondaryText,
  secondaryExplanation = null,
  secondaryLanguageLabel,
  accentColor = '#2563EB',
  questionNumberOfLines,
}: ErrorListItemProps) {
  const { t } = useTranslation();
  const { textColor, iconColor, cardBackgroundColor, secondaryBackgroundColor, borderColor } =
    useQuizColors();
  const [isPlayingGif, setIsPlayingGif] = useState(false);

  const filename = question.image_filename;
  const isGif = !!filename?.toLowerCase().endsWith('.gif');

  return (
    <View style={[styles.errorItem, { backgroundColor: cardBackgroundColor, borderColor }]}>
      <View style={styles.errorHeader}>
        <View style={[styles.errorNumberBadge, { backgroundColor: accentColor }]}>
          <ThemedText style={styles.errorNumberText}>{index + 1}</ThemedText>
        </View>
        <ThemedText
          style={[styles.errorQuestionText, { color: textColor }]}
          {...(questionNumberOfLines ? { numberOfLines: questionNumberOfLines } : {})}
        >
          {question.translation?.text || ''}
        </ThemedText>
      </View>

      {filename ? (
        <View style={styles.errorImageContainer}>
          <Pressable
            style={{ flex: 1 }}
            onPress={() => {
              if (isGif && !isPlayingGif) setIsPlayingGif(true);
            }}
          >
            {isGif ? (
              <GifImage
                uri={url ?? undefined}
                style={styles.errorImage}
                contentFit="contain"
                playing={isPlayingGif}
              />
            ) : (
              <Image
                source={{ uri: url ?? undefined }}
                style={styles.errorImage}
                contentFit="contain"
                autoplay
              />
            )}
            {isGif && !isPlayingGif && (
              <View style={[StyleSheet.absoluteFill, styles.playOverlay]}>
                <View style={styles.playButtonBackgroundSmall}>
                  <Ionicons name="play" size={24} color="#fff" style={{ marginLeft: 2 }} />
                </View>
              </View>
            )}
          </Pressable>
        </View>
      ) : null}

      <View style={styles.errorAnswersRow}>
        <View style={[styles.errorAnswerBadge, styles.errorAnswerBadgeWrong]}>
          <Ionicons name="close-circle" size={16} color="#DC2626" />
          <ThemedText style={[styles.errorBadgeText, { color: '#B91C1C' }]}>
            {t('quiz.yourAnswer', { answer: userAnswer ? t('quiz.true') : t('quiz.false') })}
          </ThemedText>
        </View>
        <View style={[styles.errorAnswerBadge, styles.errorAnswerBadgeCorrect]}>
          <Ionicons name="checkmark-circle" size={16} color="#059669" />
          <ThemedText style={[styles.errorBadgeText, { color: '#047857' }]}>
            {t('quiz.correctAnswerIs', { answer: question.is_correct ? t('quiz.true') : t('quiz.false') })}
          </ThemedText>
        </View>
      </View>

      {explanationEnabled ? (
        explanation ? (
          <View style={[styles.errorExplanationContainer, { backgroundColor: secondaryBackgroundColor }]}>
            <Ionicons name="bulb" size={14} color="#F59E0B" />
            <ThemedText style={[styles.errorExplanation, { color: iconColor }]}>{explanation}</ThemedText>
          </View>
        ) : (
          <Pressable
            onPress={() => onFetchExplanation?.(question)}
            disabled={explanationLoading}
            style={[styles.explainButton, { borderColor: '#F59E0B' }]}
          >
            {explanationLoading ? (
              <ActivityIndicator size="small" color="#F59E0B" />
            ) : (
              <Ionicons name="sparkles" size={14} color="#F59E0B" />
            )}
            <ThemedText style={[styles.explainButtonText, { color: '#F59E0B' }]}>
              {explanationLoading ? t('quiz.loadingExplanation') : t('quiz.getExplanation')}
            </ThemedText>
          </Pressable>
        )
      ) : null}

      {secondaryText || secondaryExplanation ? (
        <View style={[styles.secondaryLanguageCard, { backgroundColor: secondaryBackgroundColor, borderColor, marginTop: 12 }]}>
          <View style={styles.secondaryHeader}>
            <View style={[styles.languageBadge, { backgroundColor: borderColor }]}>
              <ThemedText style={[styles.languageBadgeText, { color: iconColor }]}>
                {secondaryLanguageLabel}
              </ThemedText>
            </View>
          </View>
          {secondaryText ? (
            <ThemedText style={[styles.secondaryText, { color: iconColor }]}>{secondaryText}</ThemedText>
          ) : null}
          {secondaryExplanation ? (
            <ThemedText style={[styles.secondaryExplanation, { color: iconColor }]}>
              {secondaryExplanation}
            </ThemedText>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export const ErrorListItem = memo(ErrorListItemBase);

const styles = StyleSheet.create({
  errorItem: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  errorHeader: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  errorNumberBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorNumberText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  errorQuestionText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
  },
  errorImageContainer: {
    width: '100%',
    height: 120,
    backgroundColor: 'rgba(0,0,0,0.02)',
    borderRadius: 8,
    marginBottom: 12,
    overflow: 'hidden',
  },
  errorImage: {
    width: '100%',
    height: '100%',
  },
  errorAnswersRow: {
    flexDirection: 'column',
    gap: 8,
    marginBottom: 12,
  },
  errorAnswerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 6,
    borderWidth: 1,
  },
  errorAnswerBadgeWrong: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  errorAnswerBadgeCorrect: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  errorBadgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  errorExplanationContainer: {
    flexDirection: 'row',
    padding: 10,
    borderRadius: 10,
    gap: 8,
    alignItems: 'flex-start',
  },
  errorExplanation: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  explainButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  explainButtonText: {
    fontSize: 13,
    fontWeight: '600',
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
  secondaryExplanation: {
    fontSize: 13,
    lineHeight: 18,
    fontStyle: 'italic',
    marginTop: 8,
    opacity: 0.8,
  },
  playOverlay: {
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    padding: 12,
  },
  playButtonBackgroundSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
