import { useColorScheme } from 'react-native';

export function useQuizTheme() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return {
    passed: {
      bg: isDark ? '#064E3B' : '#F0FDF4',
      border: isDark ? '#065F46' : '#D1FAE5',
      badge: isDark ? '#065F46' : '#D1FAE5',
      text: isDark ? '#6EE7B7' : '#065F46',
      errorLabel: isDark ? '#34D399' : '#059669',
      icon: isDark ? '#34D399' : '#10B981',
      title: isDark ? '#A7F3D0' : '#065F46',
    },
    failed: {
      bg: isDark ? '#450A0A' : '#FEF2F2',
      border: isDark ? '#7F1D1D' : '#FEE2E2',
      badge: isDark ? '#7F1D1D' : '#FEE2E2',
      text: isDark ? '#FCA5A5' : '#991B1B',
      errorLabel: isDark ? '#F87171' : '#DC2626',
      icon: isDark ? '#F87171' : '#EF4444',
      title: isDark ? '#FECACA' : '#991B1B',
    },
    abandoned: {
      bg: isDark ? '#1F2937' : '#F9FAFB',
      border: isDark ? '#374151' : '#E5E7EB',
      badge: isDark ? '#374151' : '#F3F4F6',
      text: isDark ? '#9CA3AF' : '#6B7280',
    },
    scorePills: {
      correct: {
        bg: isDark ? '#064E3B' : '#ECFDF5',
        border: isDark ? '#065F46' : '#A7F3D0',
        text: isDark ? '#6EE7B7' : '#065F46',
        icon: isDark ? '#34D399' : '#10B981',
      },
      incorrect: {
        bg: isDark ? '#450A0A' : '#FEF2F2',
        border: isDark ? '#7F1D1D' : '#FECACA',
        text: isDark ? '#FCA5A5' : '#991B1B',
        icon: isDark ? '#F87171' : '#EF4444',
      },
      scoreBlue: {
        bg: isDark ? '#1E3A8A' : '#EFF6FF',
        border: isDark ? '#1E40AF' : '#BFDBFE',
        text: isDark ? '#93C5FD' : '#1D4ED8',
        icon: isDark ? '#60A5FA' : '#2563EB',
      },
      scoreOrange: {
        bg: isDark ? '#78350F' : '#FFF7ED',
        border: isDark ? '#9A3412' : '#FED7AA',
        text: isDark ? '#FDBA74' : '#9A3412',
        icon: isDark ? '#FB923C' : '#EA580C',
      }
    }
  };
}
