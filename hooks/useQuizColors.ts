import { useThemeColor } from '@/hooks/useThemeColor';

/** Shared palette used across the quiz screens. */
export function useQuizColors() {
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const iconColor = useThemeColor({}, 'icon');
  const cardBackgroundColor = useThemeColor({ light: '#FFFFFF', dark: '#1F2937' }, 'background');
  const borderColor = useThemeColor({ light: '#E2E8F0', dark: '#374151' }, 'icon');
  const secondaryBackgroundColor = useThemeColor({ light: '#F8FAFC', dark: '#111827' }, 'background');

  return {
    backgroundColor,
    textColor,
    iconColor,
    cardBackgroundColor,
    borderColor,
    secondaryBackgroundColor,
  };
}
