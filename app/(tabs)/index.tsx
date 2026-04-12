import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useCategories } from '@/hooks/useCategories';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Category } from '@/types/categories';

type ActiveTab = 'categories' | 'hard';

const colors = [
  '#FF7F50',
  '#2ECC71',
  '#F39C12',
  '#1ABC9C',
  '#E84393',
  '#0984E3',
  '#00B894',
  '#FAB1A0',
  '#6AB04C',
  '#A29BFE',
];

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
  const { categories, hardCategories } = useCategories();
  const { isPremium: isUserPremium } = usePremiumStatus();
  const [activeTab, setActiveTab] = useState<ActiveTab>('categories');

  const tabBg = useThemeColor({ light: '#F3F4F6', dark: '#1F2937' }, 'background');
  const tabActiveBg = useThemeColor({ light: '#FFFFFF', dark: '#374151' }, 'background');
  const tabActiveText = useThemeColor({ light: '#111827', dark: '#F9FAFB' }, 'text');
  const tabInactiveText = useThemeColor({ light: '#6B7280', dark: '#9CA3AF' }, 'text');
  const secondaryTextColor = useThemeColor({ light: '#6B7280', dark: '#9CA3AF' }, 'text');

  const handleCategoryPress = (categoryId: string, isCategoryPremium: boolean) => {
    if (isCategoryPremium && !isUserPremium) return;

    const allCategories = [...categories, ...hardCategories];
    const category = allCategories.find((c) => c.id === categoryId);
    router.push({
      pathname: '/quizBatch',
      params: { categoryId, categoryName: category?.name },
    });
  };

  const renderCategoryGrid = (list: Category[]) => {
    if (list.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="layers-outline" size={48} color={tabInactiveText} />
          <ThemedText style={[styles.emptyText, { color: secondaryTextColor }]}>
            {t('quiz.hardEmwty')}
          </ThemedText>
        </View>
      );
    }

    return (
      <View style={styles.categoriesGrid}>
        {list.map((category) => {
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
              <ThemedText style={styles.categoryTitle}>{category.name}</ThemedText>
              <ThemedText style={styles.categoryDescription}>{category.description}</ThemedText>
              {isLocked && (
                <ThemedText style={styles.premiumLabel}>{t('premium.required')}</ThemedText>
              )}
            </Pressable>
          );
        })}
      </View>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.headerTitle}>
        {t('quiz.title')}
      </ThemedText>
      <ThemedText style={styles.subtitle}>{t('quiz.subtitle')}</ThemedText>

      {/* ── Tab Switcher ── */}
      <View style={[styles.tabBar, { backgroundColor: tabBg }]}>
        <Pressable
          style={[
            styles.tabItem,
            activeTab === 'categories' && [styles.tabItemActive, { backgroundColor: tabActiveBg }],
          ]}
          onPress={() => setActiveTab('categories')}
        >
          <ThemedText
            style={[
              styles.tabLabel,
              { color: activeTab === 'categories' ? tabActiveText : tabInactiveText },
              activeTab === 'categories' && styles.tabLabelActive,
            ]}
          >
            {t('quiz.tabCategories')}
          </ThemedText>
        </Pressable>

        <Pressable
          style={[
            styles.tabItem,
            activeTab === 'hard' && [styles.tabItemActive, { backgroundColor: tabActiveBg }],
          ]}
          onPress={() => setActiveTab('hard')}
        >
          <ThemedText
            style={[
              styles.tabLabel,
              { color: activeTab === 'hard' ? tabActiveText : tabInactiveText },
              activeTab === 'hard' && styles.tabLabelActive,
            ]}
          >
            {t('quiz.tabHard')}
          </ThemedText>
        </Pressable>
      </View>

      {/* ── Content ── */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollViewContent}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'categories'
          ? renderCategoryGrid(categories)
          : renderCategoryGrid(hardCategories)}
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
    marginBottom: 20,
    opacity: 0.7,
    paddingHorizontal: 16,
  },

  // ── Tab Bar ──
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    padding: 4,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  tabItemActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  tabLabelActive: {
    fontWeight: '700',
  },
  hardBadge: {
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  hardBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },

  // ── Grid ──
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
  },
  categoryCardPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
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

  // ── Empty State ──
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 16,
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
    opacity: 0.7,
    paddingHorizontal: 24,
  },
});