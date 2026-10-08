import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useCategories } from '@/hooks/useCategories';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Category } from '@/types/categories';

type ActiveTab = 'categories' | 'hard';

export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { categories, hardCategories, loading } = useCategories();
  const { isPremium: isUserPremium } = usePremiumStatus();
  const [activeTab, setActiveTab] = useState<ActiveTab>('categories');
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;

  const tabBg = useThemeColor({ light: '#F3F4F6', dark: '#1F2937' }, 'background');
  const tabActiveBg = useThemeColor({ light: '#FFFFFF', dark: '#374151' }, 'background');
  const tabActiveText = useThemeColor({ light: '#111827', dark: '#F9FAFB' }, 'text');
  const tabInactiveText = useThemeColor({ light: '#6B7280', dark: '#9CA3AF' }, 'text');
  const secondaryTextColor = useThemeColor({ light: '#6B7280', dark: '#9CA3AF' }, 'text');
  const skeletonColor = useThemeColor({ light: '#E5E7EB', dark: '#374151' }, 'background');
  const mutedSurface = useThemeColor({ light: '#F8FAFC', dark: '#111827' }, 'background');
  const accentSurface = useThemeColor({ light: '#EEF4FF', dark: '#172554' }, 'background');
  const accentColor = useThemeColor({ light: '#2563EB', dark: '#60A5FA' }, 'text');

  const cardBg = useThemeColor({ light: '#b1cbffff', dark: '#1F2937' }, 'background');
  const cardBorder = useThemeColor({ light: '#E5E7EB', dark: '#374151' }, 'background');
  const iconBg = useThemeColor({ light: '#FFFFFF', dark: '#374151' }, 'background');
  const iconColor = useThemeColor({ light: '#2563EB', dark: '#60A5FA' }, 'text');

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

          return (
            <Pressable
              key={category.id}
              style={({ pressed }) => [
                styles.categoryRowCard,
                { backgroundColor: cardBg, borderColor: cardBorder },
                pressed && styles.categoryCardPressed,
                isLocked && styles.categoryCardLocked,
              ]}
              onPress={() => handleCategoryPress(category.id, category.is_premium)}
            >
              <View style={[styles.categoryIconContainer, { backgroundColor: iconBg }]}>
                <Ionicons name={category.icon_url as any} size={28} color={iconColor} />
              </View>
              <View style={styles.categoryContentContainer}>
                <ThemedText type="defaultSemiBold" style={styles.categoryTitle} numberOfLines={3}>{category.sort_order}. {category.name}</ThemedText>
                <ThemedText style={[styles.categoryDescription, { color: secondaryTextColor }]} numberOfLines={1}>{t('quiz.batchCount', { count: category.batchesCount })}</ThemedText>
              </View>

              {isLocked ? (
                <View style={styles.categoryRightAction}>
                  <Ionicons name="lock-closed" size={20} color={secondaryTextColor} style={[styles.lockIcon, { backgroundColor: iconBg }]} />
                </View>
              ) : (
                <View style={styles.categoryRightAction}>
                  <Ionicons name="chevron-forward" size={20} color={secondaryTextColor} style={{ opacity: 0.8 }} />
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
          <View key={key} style={[styles.categoryRowCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <View style={[styles.categoryIconContainer, { backgroundColor: iconBg }]} />
            <View style={styles.categoryContentContainer}>
              <View style={[styles.skeletonLine, { width: '60%', height: 16, marginBottom: 8, backgroundColor: skeletonColor }]} />
              <View style={[styles.skeletonLine, { width: '90%', height: 12, backgroundColor: skeletonColor }]} />
            </View>
          </View>
        ))}
      </View>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.page}>
        <View style={[styles.shell, isDesktop && styles.desktopShell]}>
          <View style={styles.topbar}>
            <View>
              <ThemedText style={styles.eyebrow}>EASYPATENTE / TRAINING DESK</ThemedText>
              <ThemedText type="title" style={styles.headerTitle}>{t('quiz.title')}</ThemedText>
              <ThemedText style={styles.subtitle}>{t('quiz.subtitle')}</ThemedText>
            </View>
            <View style={[styles.statusPill, { backgroundColor: accentSurface }]}>
              <View style={[styles.statusDot, { backgroundColor: accentColor }]} />
              <ThemedText style={[styles.statusText, { color: accentColor }]}>Ready to practice</ThemedText>
            </View>
          </View>

          {isDesktop && (
            <View style={styles.overviewRow}>
              <View style={[styles.overviewCard, { backgroundColor: accentSurface }]}>
                <ThemedText style={styles.cardEyebrow}>YOUR NEXT STEP</ThemedText>
                <ThemedText type="defaultSemiBold" style={styles.overviewTitle}>Choose a topic and keep your momentum.</ThemedText>
                <ThemedText style={[styles.overviewCopy, { color: secondaryTextColor }]}>Short focused sessions make the road to your licence easier.</ThemedText>
              </View>
              <View style={[styles.metricCard, { backgroundColor: mutedSurface, borderColor: cardBorder }]}>
                <ThemedText style={styles.cardEyebrow}>ACTIVE TOPICS</ThemedText>
                <ThemedText style={styles.metricValue}>{categories.length}</ThemedText>
                <ThemedText style={[styles.metricLabel, { color: secondaryTextColor }]}>available to study</ThemedText>
              </View>
              <View style={[styles.metricCard, { backgroundColor: mutedSurface, borderColor: cardBorder }]}>
                <ThemedText style={styles.cardEyebrow}>MODE</ThemedText>
                <ThemedText style={styles.metricValue}>15</ThemedText>
                <ThemedText style={[styles.metricLabel, { color: secondaryTextColor }]}>questions per batch</ThemedText>
              </View>
            </View>
          )}

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
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  page: { paddingBottom: 40 },
  shell: { width: '100%' },
  desktopShell: { maxWidth: 1180, alignSelf: 'center', paddingHorizontal: 36 },
  topbar: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingTop: 42, paddingBottom: 28 },
  eyebrow: { fontSize: 11, letterSpacing: 1.8, opacity: 0.55, marginBottom: 12 },
  headerTitle: { marginBottom: 8, paddingHorizontal: 0, fontSize: 38, lineHeight: 44 },
  subtitle: { marginBottom: 0, opacity: 0.7, paddingHorizontal: 0, maxWidth: 560 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, marginTop: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '600' },
  overviewRow: { flexDirection: 'row', gap: 14, marginBottom: 28 },
  overviewCard: { flex: 2, borderRadius: 18, padding: 22, minHeight: 142 },
  metricCard: { flex: 1, borderRadius: 18, padding: 22, minHeight: 142, borderWidth: 1 },
  cardEyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.4, opacity: 0.58, marginBottom: 12 },
  overviewTitle: { fontSize: 19, lineHeight: 25, marginBottom: 8 },
  overviewCopy: { fontSize: 13, lineHeight: 19, maxWidth: 360 },
  metricValue: { fontSize: 34, fontWeight: '700', marginBottom: 2 },
  metricLabel: { fontSize: 12 },

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
    borderWidth: 1,
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
