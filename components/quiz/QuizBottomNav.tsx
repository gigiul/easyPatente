import { ThemedText } from '@/components/ThemedText';
import { useQuizColors } from '@/hooks/useQuizColors';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

interface NavRightAction {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  /** row-reverse: icon before the label (main quiz navigation). */
  reverse?: boolean;
}

interface QuizBottomNavProps {
  onPrevious: () => void;
  previousDisabled?: boolean;
  counter: string;
  right: NavRightAction;
}

export function QuizBottomNav({ onPrevious, previousDisabled = false, counter, right }: QuizBottomNavProps) {
  const { t } = useTranslation();
  const { backgroundColor, iconColor, borderColor } = useQuizColors();

  return (
    <BlurView
      intensity={80}
      tint={backgroundColor === '#000000' ? 'dark' : 'light'}
      style={[styles.navigationBar, { borderTopColor: borderColor }]}
    >
      <View style={styles.navContent}>
        <Pressable
          style={[styles.navButton, previousDisabled && styles.navButtonDisabled]}
          onPress={onPrevious}
          disabled={previousDisabled}
        >
          <Ionicons name="chevron-back" size={20} color={previousDisabled ? '#9CA3AF' : '#2563EB'} />
          <ThemedText style={[styles.navButtonText, previousDisabled && styles.navButtonTextDisabled]}>
            {t('quiz.previous')}
          </ThemedText>
        </Pressable>

        <ThemedText style={[styles.questionIndicator, { color: iconColor }]}>{counter}</ThemedText>

        <Pressable
          style={[
            styles.navButton,
            right.reverse && styles.navButtonRight,
            right.disabled && styles.navButtonDisabled,
          ]}
          onPress={right.onPress}
          disabled={right.disabled}
        >
          <ThemedText
            style={[styles.navButtonText, right.disabled && styles.navButtonTextDisabled]}
          >
            {right.label}
          </ThemedText>
          <Ionicons
            name={right.icon}
            size={20}
            color={right.disabled ? '#9CA3AF' : '#2563EB'}
          />
        </Pressable>
      </View>
    </BlurView>
  );
}

const styles = StyleSheet.create({
  navigationBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 28,
    borderTopWidth: 1,
  },
  navContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 4,
  },
  navButtonRight: {
    flexDirection: 'row-reverse',
  },
  navButtonDisabled: {
    opacity: 0.4,
  },
  navButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2563EB',
  },
  navButtonTextDisabled: {
    color: '#9CA3AF',
  },
  questionIndicator: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
});
