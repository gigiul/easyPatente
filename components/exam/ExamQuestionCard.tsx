import AppImageViewer from '@/components/AppImageViewer';
import GifImage from '@/components/GifImage';
import { ThemedText } from '@/components/ThemedText';
import { useQuizColors } from '@/hooks/useQuizColors';
import type { QuizQuestion } from '@/store/quizQuestions';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

interface ExamQuestionCardProps {
  question?: QuizQuestion | null;
  text: string;
  secondaryText: string | null;
  languageLabel: string;
  imageUrl: string | null;
}

export function ExamQuestionCard({
  question,
  text,
  secondaryText,
  languageLabel,
  imageUrl,
}: ExamQuestionCardProps) {
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
      <ThemedText style={[styles.questionText, { color: textColor }]}>{text}</ThemedText>

      {secondaryText ? (
        <View style={[styles.secondaryLanguageCard, { backgroundColor: secondaryBackgroundColor, borderColor, marginTop: 16 }]}>
          <View style={styles.secondaryHeader}>
            <View style={[styles.languageBadge, { backgroundColor: borderColor }]}>
              <ThemedText style={[styles.languageBadgeText, { color: iconColor }]}>
                {languageLabel}
              </ThemedText>
            </View>
          </View>
          <ThemedText style={[styles.secondaryText, { color: iconColor }]}>{secondaryText}</ThemedText>
        </View>
      ) : null}

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
              <ActivityIndicator color="#059669" />
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
    </View>
  );
}

const styles = StyleSheet.create({
  questionCard: {
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
    minHeight: 200,
    justifyContent: 'center',
  },
  questionText: { fontSize: 20, lineHeight: 30, fontWeight: '500', textAlign: 'center' },
  imageContainer: { marginTop: 20, borderRadius: 12, overflow: 'hidden' },
  questionImage: { width: '100%', height: 200 },
  imageLoader: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  secondaryLanguageCard: {
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
});
