import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useCategories } from '@/hooks/useCategories';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';

const colors = [
  "#FF7F50",
  "#2ECC71",
  "#F39C12",
  "#1ABC9C",
  "#E84393",
  "#0984E3",
  "#00B894",
  "#FAB1A0",
  "#6AB04C",
  "#A29BFE"
]

const getCategoryColor = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { categories } = useCategories();
  const { isPremium: isUserPremium } = usePremiumStatus();

  const handleCategoryPress = (categoryId: string, isCategoryPremium: boolean) => {
    if (isCategoryPremium && !isUserPremium) {
      return;
    }

    const category = categories.find(c => c.id === categoryId);
    router.push({
      pathname: '/quizBatch',
      params: {
        categoryId,
        categoryName: category?.name
      },
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
                    { backgroundColor: category.color || getCategoryColor(category.id) },
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
                    {category.name}
                  </ThemedText>
                  <ThemedText style={styles.categoryDescription}>
                    {category.description}
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