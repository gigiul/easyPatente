import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { CATEGORY_COLOR_MAP } from '@/constants/Colors';
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

const getCategoryStyle = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CATEGORY_COLOR_MAP[Math.abs(hash) % CATEGORY_COLOR_MAP.length];
};

const getContrastTextColor = (hexColor: string | null | undefined) => {
  if (!hexColor) return '#FFFFFF';
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  // YIQ formula for perceived luminance
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? '#111827' : '#FFFFFF';
};

export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { categories, hardCategories, loading } = useCategories();
  const { isPremium: isUserPremium } = usePremiumStatus();
  const [activeTab, setActiveTab] = useState<ActiveTab>('categories');

  const tabBg = useThemeColor({ light: '#F3F4F6', dark: '#1F2937' }, 'background');
  const tabActiveBg = useThemeColor({ light: '#FFFFFF', dark: '#374151' }, 'background');
  const tabActiveText = useThemeColor({ light: '#111827', dark: '#F9FAFB' }, 'text');
  const tabInactiveText = useThemeColor({ light: '#6B7280', dark: '#9CA3AF' }, 'text');
  const secondaryTextColor = useThemeColor({ light: '#6B7280', dark: '#9CA3AF' }, 'text');
  const skeletonColor = useThemeColor({ light: '#E5E7EB', dark: '#374151' }, 'background');

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
            {t('quiz.hardEmpty')}
          </ThemedText>
        </View>
      );
    }

    return (
      <View style={styles.categoriesGrid}>
        {list.map((category) => {
          const isLocked = category.is_premium && !isUserPremium;
          const style = getCategoryStyle(category.id) || { bg: category.color, text: getContrastTextColor(category.color) };

          const bgColor = style.bg;
          const textColor = style.text;
          const iconBgColor = textColor === '#FFFFFF' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)';
          const lockBgColor = textColor === '#FFFFFF' ? 'rgba(0, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.5)';

          return (
            <Pressable
              key={category.id}
              style={({ pressed }) => [
                styles.categoryRowCard,
                { backgroundColor: bgColor },
                pressed && styles.categoryCardPressed,
                isLocked && styles.categoryCardLocked,
              ]}
              onPress={() => handleCategoryPress(category.id, category.is_premium)}
            >
              <View style={[styles.categoryIconContainer, { backgroundColor: iconBgColor }]}>
                <Ionicons name={category.icon_url as any} size={28} color={textColor} />
              </View>
              <View style={styles.categoryContentContainer}>
                <ThemedText style={[styles.categoryTitle, { color: textColor }]} numberOfLines={2}>{category.sort_order}. {category.name}</ThemedText>
                <ThemedText style={[styles.categoryDescription, { color: textColor }]} numberOfLines={3}>{category.description}</ThemedText>
              </View>

              {isLocked ? (
                <View style={styles.categoryRightAction}>
                  <Ionicons name="lock-closed" size={20} color={textColor} style={[styles.lockIcon, { backgroundColor: lockBgColor }]} />
                </View>
              ) : (
                <View style={styles.categoryRightAction}>
                  <Ionicons name="chevron-forward" size={20} color={textColor} style={{ opacity: 0.8 }} />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    );
  };

  const renderSkeleton = () => {
    return (
      <View style={styles.categoriesGrid}>
        {[1, 2, 3, 4, 5].map((key) => (
          <View key={key} style={[styles.categoryRowCard, { backgroundColor: skeletonColor, opacity: 0.6 }]}>
            <View style={[styles.categoryIconContainer, { backgroundColor: 'rgba(0,0,0,0.05)' }]} />
            <View style={styles.categoryContentContainer}>
              <View style={[styles.skeletonLine, { width: '60%', height: 16, marginBottom: 8, backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: 4 }]} />
              <View style={[styles.skeletonLine, { width: '90%', height: 12, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 4 }]} />
            </View>
          </View>
        ))}
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
        {loading ? (
          renderSkeleton()
        ) : activeTab === 'categories' ? (
          renderCategoryGrid(categories)
        ) : (
          renderCategoryGrid(hardCategories)
        )}
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

  // ── List (ex-Grid) ──
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    padding: 16,
    paddingBottom: 40,
  },
  categoriesGrid: {
    flexDirection: 'column',
    gap: 12,
  },
  categoryRowCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
  },
  categoryIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  categoryContentContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  categoryRightAction: {
    marginLeft: 12,
    justifyContent: 'center',
    alignItems: 'center',
    width: 32,
  },
  categoryCardPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  categoryCardLocked: {
    opacity: 0.7,
  },
  lockIcon: {
    borderRadius: 10,
    padding: 4,
  },
  categoryTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 2,
  },
  categoryDescription: {
    opacity: 0.85,
    fontSize: 12,
    lineHeight: 16,
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
  skeletonLine: {
    borderRadius: 4,
  },
});