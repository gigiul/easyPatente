import { ThemedText } from '@/components/ThemedText';
import { useQuizColors } from '@/hooks/useQuizColors';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

interface ExamHeaderProps {
  current: number;
  total: number;
  timeLeft: number;
}

export function ExamHeader({ current, total, timeLeft }: ExamHeaderProps) {
  const { t } = useTranslation();
  const { textColor, cardBackgroundColor, borderColor } = useQuizColors();

  const isLowTime = timeLeft < 120;
  const timerColor = isLowTime ? '#DC2626' : '#2563EB';
  const progressPercent = total > 0 ? (current / total) * 100 : 0;

  return (
    <View style={[styles.header, { backgroundColor: cardBackgroundColor, borderBottomColor: borderColor }]}>
      <View style={styles.headerTitleRow}>
        <View style={styles.timerBadge}>
          <Ionicons name="timer-outline" size={18} color={timerColor} />
          <ThemedText style={[styles.timerText, { color: timerColor }]}>{formatTime(timeLeft)}</ThemedText>
        </View>
        <ThemedText style={[styles.questionIndicator, { color: textColor }]}>
          {t('exam.questionOf', { current, total })}
        </ThemedText>
      </View>

      <View style={[styles.headerProgressTrack, { backgroundColor: borderColor }]}>
        <View style={[styles.headerProgressFill, { width: `${progressPercent}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 56,
    paddingBottom: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  timerText: { fontSize: 16, fontWeight: '700' },
  questionIndicator: { fontSize: 15, fontWeight: '600' },
  headerProgressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  headerProgressFill: { height: '100%', backgroundColor: '#059669', borderRadius: 3 },
});
