import AppImageViewer from '@/components/AppImageViewer';
import GifImage from '@/components/GifImage';
import { ThemedText } from '@/components/ThemedText';
import { useQuizColors } from '@/hooks/useQuizColors';
import type { QuizQuestion } from '@/store/quizQuestions';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

interface QuestionCardProps {
  question?: QuizQuestion | null;
  text: string;
  secondaryText: string | null;
  languageLabel: string;
  imageUrl: string | null;
  onSpeak: () => void;
  onSpeakSecondary: () => void;
}

export function QuestionCard({
  question,
  text,
  secondaryText,
  languageLabel,
  imageUrl,
  onSpeak,
  onSpeakSecondary,
}: QuestionCardProps) {
  const { t } = useTranslation();
  const { textColor, iconColor, cardBackgroundColor, secondaryBackgroundColor, borderColor } =
    useQuizColors();

  const [isPlayingGif, setIsPlayingGif] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [isImageViewerVisible, setIsImageViewerVisible] = useState(false);

  const filename = question?.image_filename;
  const isGif = !!filename?.toLowerCase().endsWith('.gif');
  const showImageLoader = !!filename && (!imageUrl || isImageLoading);

  const handleImagePress = () => {
    if (isGif && !isPlayingGif) {
      setIsPlayingGif(true);
    } else {
      setIsImageViewerVisible(true);
    }
  };

  return (
    <View style={[styles.questionCard, { backgroundColor: cardBackgroundColor }]}>
      <View style={styles.questionBadgeRow}>
        <View style={styles.questionBadge}>
          <Ionicons name="help-circle" size={16} color="#2563EB" />
          <ThemedText style={styles.questionBadgeText}>{t('quiz.question')}</ThemedText>
        </View>
        <Pressable onPress={onSpeak} style={[styles.speakButtonSmall, { backgroundColor: secondaryBackgroundColor }]}>
          <Ionicons name="volume-high" size={20} color="#2563EB" />
        </Pressable>
      </View>

      <ThemedText style={[styles.questionText, { color: textColor }]}>{text}</ThemedText>

      {filename ? (
        <View style={[styles.imageContainer, { backgroundColor: secondaryBackgroundColor }]}>
          <Pressable onPress={handleImagePress}>
            {isGif ? (
              <GifImage
                key={filename}
                uri={imageUrl ?? undefined}
                style={styles.questionImage}
                contentFit="contain"
                playing={isPlayingGif}
                onLoadStart={() => setIsImageLoading(true)}
                onLoad={() => setIsImageLoading(false)}
                onError={() => setIsImageLoading(false)}
              />
            ) : (
              <Image
                key={filename}
                source={{ uri: imageUrl ?? undefined }}
                style={styles.questionImage}
                contentFit="contain"
                autoplay
                onLoadStart={() => setIsImageLoading(true)}
                onLoad={() => setIsImageLoading(false)}
                onError={() => setIsImageLoading(false)}
              />
            )}
            {isGif && !isPlayingGif && (
              <View style={[StyleSheet.absoluteFill, styles.playOverlay]}>
                <View style={styles.playButtonBackground}>
                  <Ionicons name="play" size={36} color="#fff" style={{ marginLeft: 4 }} />
                </View>
              </View>
            )}
          </Pressable>
          {showImageLoader && (
            <View style={[StyleSheet.absoluteFill, styles.imageLoader]}>
              <ActivityIndicator color="#2563EB" />
            </View>
          )}
          <AppImageViewer
            images={imageUrl ? [{ uri: imageUrl }] : []}
            imageIndex={0}
            visible={isImageViewerVisible}
            onRequestClose={() => setIsImageViewerVisible(false)}
          />
        </View>
      ) : null}

      {secondaryText ? (
        <View style={[styles.secondaryLanguageCard, { backgroundColor: secondaryBackgroundColor, borderColor }]}>
          <View style={styles.secondaryHeader}>
            <View style={[styles.languageBadge, { backgroundColor: borderColor }]}>
              <ThemedText style={[styles.languageBadgeText, { color: iconColor }]}>
                {languageLabel}
              </ThemedText>
            </View>
            <Pressable onPress={onSpeakSecondary} style={[styles.speakButtonSmall, { backgroundColor: borderColor }]}>
              <Ionicons name="volume-high" size={18} color="#6B7280" />
            </Pressable>
          </View>
          <ThemedText style={[styles.secondaryQuestionText, { color: iconColor }]}>{secondaryText}</ThemedText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  questionCard: {
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  questionBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  questionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 5,
    alignSelf: 'flex-start',
  },
  questionBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563EB',
  },
  questionText: {
    fontSize: 20,
    lineHeight: 29,
    fontWeight: '500',
  },
  imageContainer: {
    marginTop: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  questionImage: {
    width: '100%',
    height: 180,
  },
  imageLoader: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.02)',
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
  secondaryQuestionText: {
    fontSize: 20,
    lineHeight: 28,
  },
  playOverlay: {
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    padding: 12,
  },
  playButtonBackground: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  speakButtonSmall: {
    padding: 5,
    borderRadius: 8,
  },
});
