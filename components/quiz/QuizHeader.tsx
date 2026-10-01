import { Ionicons } from '@expo/vector-icons';
import { useQuizColors } from '@/hooks/useQuizColors';
import { ThemedText } from '@/components/ThemedText';
import { Pressable, StyleSheet, View } from 'react-native';

interface QuizHeaderProps {
  title: string;
  subtitle?: string;
  progressPercent: number;
  progressLabel?: string;
  onBack: () => void;
}

export function QuizHeader({ title, subtitle, progressPercent, progressLabel, onBack }: QuizHeaderProps) {
  const { textColor, iconColor, cardBackgroundColor, borderColor } = useQuizColors();

  return (
    <View style={[styles.header, { backgroundColor: cardBackgroundColor, borderBottomColor: borderColor }]}>
      <Pressable onPress={onBack} style={styles.backButton}>
        <Ionicons name="arrow-back" size={24} color="#2563EB" />
      </Pressable>
      <View style={{ flex: 1 }}>
        <ThemedText style={[styles.title, { color: textColor }]} {...(subtitle ? {} : { numberOfLines: 1 })}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText style={[styles.subtitle, { color: iconColor }]}>{subtitle}</ThemedText>
        ) : (
          <View style={styles.progressRow}>
            <View style={[styles.progressTrack, { backgroundColor: borderColor }]}>
              <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
            </View>
            <ThemedText style={[styles.progressLabel, { color: iconColor }]}>{progressLabel}</ThemedText>
          </View>
        )}
      </View>
      {subtitle ? (
        <View style={styles.progressWrapper}>
          <View style={[styles.progressTrack, { backgroundColor: borderColor }]}>
            <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    gap: 10,
  },
  backButton: {
    padding: 6,
    borderRadius: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressWrapper: {
    marginTop: 4,
  },
  progressTrack: {
    flex: 1,
    height: 5,
    borderRadius: 3,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#2563EB',
    borderRadius: 3,
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: '600',
    minWidth: 36,
    textAlign: 'right',
  },
});
