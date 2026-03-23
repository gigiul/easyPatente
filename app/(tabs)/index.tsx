import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useCategories } from '@/hooks/useCategories';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';

// Helper to map category code to color
const CATEGORY_COLORS: Record<string, string> = {
  roadSigns: '#FF6B6B',
  rightOfWay: '#4ECDC4',
  speedLimits: '#FFD93D',
  roadSafety: '#95E1D3',
  maintenance: '#FF8B94',
  complete: '#6C5CE7',
};
function getCategoryColor(code: string) {
  return CATEGORY_COLORS[code] || '#ccc';
}

export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { categories } = useCategories();
  const { isPremium: isUserPremium } = usePremiumStatus();

  const handleCategoryPress = (categoryId: string, isCategoryPremium: boolean) => {
    if (isCategoryPremium && !isUserPremium) {
            return;
    }
    
    router.push({
      pathname: '/quizBatch',
      params: { categoryId },
    });
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.headerTitle}>{t('quiz.title')}</ThemedText>
      <ThemedText style={styles.subtitle}>{t('quiz.subtitle')}</ThemedText>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollViewContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.categoriesGrid}>
          {categories
            .filter((category) => category.code !== 'complete')
            .map((category) => {
            const isLocked = category.is_premium && !isUserPremium;
            return (
              <Pressable
                key={category.id}
                style={({ pressed }) => [
                  styles.categoryCard,
                  { backgroundColor: getCategoryColor(category.code) },
                  pressed && styles.categoryCardPressed,
                  isLocked && styles.categoryCardLocked,
                ]}
                onPress={() => handleCategoryPress(category.id, category.is_premium)}
              >
                <View style={styles.categoryHeader}>
                  <Ionicons name={category.icon_url as any} size={32} color="#fff" />
                  {isLocked && (
                    <Ionicons name="lock-closed" size={20} color="#fff" style={styles.lockIcon} />
                  )}
                </View>
                <ThemedText style={styles.categoryTitle}>
                  {t(`quiz.categories.${category.code}.title`)}
                </ThemedText>
                <ThemedText style={styles.categoryDescription}>
                  {t(`quiz.categories.${category.code}.description`)}
                </ThemedText>
                {isLocked && (
                  <ThemedText style={styles.premiumLabel}>
                    {t('premium.required')}
                  </ThemedText>
                )}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerTitle: {
    marginTop: 60,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  subtitle: {
    marginBottom: 24,
    opacity: 0.7,
    paddingHorizontal: 16,
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    padding: 16,
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  categoryCard: {
    width: '47%',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  categoryCardPressed: {
    opacity: 0.8,
  },
  categoryCardLocked: {
    opacity: 0.7,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  lockIcon: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 10,
    padding: 2,
  },
  categoryTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  categoryDescription: {
    color: '#fff',
    opacity: 0.9,
    fontSize: 14,
  },
  premiumLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    textAlign: 'center',
  },
});