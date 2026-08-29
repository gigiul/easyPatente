import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { LanguagePicker } from '@/components/LanguagePicker';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/hooks/useAuth';
import { useThemeColor } from '@/hooks/useThemeColor';
import i18n from '@/i18n';
import { deleteUserAccount, updateUserLanguage } from '@/queries/user';
import { useLanguagesStore } from '@/store/languages';
import { useUserProfileStore } from '@/store/user';

export default function UserScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { signOut, session } = useAuth();
  const languages = useLanguagesStore((state) => state.languages);
  const userProfile = useUserProfileStore((state) => state.user);
  const [primaryLanguage, setPrimaryLanguage] = useState<string>('');
  const [secondaryLanguage, setSecondaryLanguage] = useState<string | null>('');
  const appVersion = Constants.expoConfig?.version || '1.0.0';

  // Theme colors
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackgroundColor = useThemeColor({ light: '#FFFFFF', dark: '#1F2937' }, 'background');
  const borderColor = useThemeColor({ light: '#E5E7EB', dark: '#374151' }, 'icon');
  const secondaryTextColor = useThemeColor({ light: '#6B7280', dark: '#9CA3AF' }, 'text');
  const accentColor = '#2563EB';
  const dangerColor = '#EF4444';

  useEffect(() => {
    const { lang_primary, lang_secondary } = userProfile || {};
    if (lang_primary) {
      setPrimaryLanguage(lang_primary);
      i18n.changeLanguage(lang_primary);
    }
    if (lang_secondary) {
      setSecondaryLanguage(lang_secondary);
    }
    if (!lang_primary && languages.length > 0) {
      const setDefaultLanguage = async () => {
        const defaultLang = languages.find((l) => l.is_default) || languages[0];
        setPrimaryLanguage(defaultLang.code);
        await i18n.changeLanguage(defaultLang.code);
      };
      setDefaultLanguage();
    }
  }, [languages, userProfile]);

  const handlePrimaryLanguageChange = async (langCode: string) => {
    setPrimaryLanguage(langCode);
    await i18n.changeLanguage(langCode);
    await updateUserLanguage(langCode, 'primary');
  };

  const handleSecondaryLanguageChange = async (langCode: string) => {
    setSecondaryLanguage(langCode || null);
    await updateUserLanguage(langCode || null, 'secondary');
  };

  const handleLogout = async () => {
    Alert.alert(
      t('user.logout'),
      t('auth.login.subtitle'), // Using a close enough key if logout confirm is missing
      [
        { text: t('user.cancel'), style: 'cancel' },
        {
          text: t('user.logout'),
          style: 'destructive',
          onPress: async () => {
            const { error } = await signOut();
            if (error) {
              Alert.alert('Error', error.message);
              return;
            }
            router.replace('/login');
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      t('user.deleteAccount'),
      t('user.deleteAccountConfirm'),
      [
        { text: t('user.cancel'), style: 'cancel' },
        {
          text: t('user.deleteAccount'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteUserAccount();
              await signOut();
              router.replace('/login');
            } catch (error: any) {
              Alert.alert('Error', error.message);
            }
          },
        },
      ]
    );
  };



  const renderSettingRow = (icon: any, label: string, value?: string, onPress?: () => void) => (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: borderColor },
        pressed && onPress && styles.rowPressed,
      ]}
      onPress={onPress}
    >
      <View style={styles.rowLeft}>
        <View style={[styles.iconContainer, { backgroundColor: borderColor }]}>
          <Ionicons name={icon} size={20} color={accentColor} />
        </View>
        <ThemedText style={styles.rowLabel}>{label}</ThemedText>
      </View>
      <View style={styles.rowRight}>
        {value && <ThemedText style={[styles.rowValue, { color: secondaryTextColor }]}>{value}</ThemedText>}
        {onPress && <Ionicons name="chevron-forward" size={18} color={secondaryTextColor} />}
      </View>
    </Pressable>
  );

  return (
    <ThemedView style={[styles.container, { backgroundColor }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Header Section */}
        <View style={styles.header}>
          <View style={[styles.avatarPlaceholder, { backgroundColor: accentColor }]}>
            <ThemedText style={styles.avatarText}>
              {session?.user?.email?.charAt(0).toUpperCase() || 'U'}
            </ThemedText>
          </View>
          <ThemedText type="title" style={styles.userName}>
            {session?.user?.email?.split('@')[0] || 'User'}
          </ThemedText>
          <ThemedText style={[styles.userEmail, { color: secondaryTextColor }]}>
            {session?.user?.email}
          </ThemedText>

          <View style={[styles.badge, { backgroundColor: userProfile?.is_premium ? '#F59E0B' : borderColor }]}>
            <Ionicons name={userProfile?.is_premium ? "star" : "person"} size={12} color={userProfile?.is_premium ? "#FFF" : accentColor} />
            <ThemedText style={[styles.badgeText, { color: userProfile?.is_premium ? "#FFF" : accentColor }]}>
              {userProfile?.is_premium ? t('user.account.premium') : t('user.account.free')}
            </ThemedText>
          </View>
        </View>

        {/* LINGUA - CORE FEATURE */}
        <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
          {t('user.sections.language')}
        </ThemedText>
        <View style={[styles.card, { backgroundColor: cardBackgroundColor, borderColor }]}>
          <View style={styles.pickerContainer}>
            <LanguagePicker
              value={primaryLanguage}
              onChange={handlePrimaryLanguageChange}
              title={t('user.language.title')}
              excludeLanguage={secondaryLanguage}
              languages={languages}
            />
          </View>
          <View style={[styles.separator, { backgroundColor: borderColor }]} />
          <View style={styles.pickerContainer}>
            <LanguagePicker
              value={secondaryLanguage}
              onChange={handleSecondaryLanguageChange}
              title={t('user.secondaryLanguage.title')}
              excludeLanguage={primaryLanguage}
              allowNone
              languages={languages}
            />
          </View>
        </View>

        <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
          {t('user.sections.legal')}
        </ThemedText>
        <View style={[styles.card, { backgroundColor: cardBackgroundColor, borderColor }]}>
          {renderSettingRow('document-text-outline', t('user.legal.terms'), undefined, () => router.push('/terms' as any))}
          {renderSettingRow('shield-checkmark-outline', t('user.legal.privacy'), undefined, () => router.push('/privacy' as any))}
          {renderSettingRow('information-circle-outline', t('user.legal.version'), appVersion)}
        </View>

        {/* Danger Zone */}
        <View style={styles.actionContainer}>
          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              { backgroundColor: cardBackgroundColor, borderColor: borderColor },
              pressed && styles.rowPressed,
            ]}
            onPress={handleLogout}
          >
            <Ionicons name="log-out-outline" size={20} color={dangerColor} />
            <ThemedText style={[styles.actionButtonText, { color: dangerColor }]}>
              {t('user.logout')}
            </ThemedText>
          </Pressable>

          <Pressable onPress={handleDeleteAccount} style={styles.deleteLink}>
            <ThemedText style={[styles.deleteText, { color: secondaryTextColor }]}>
              {t('user.deleteAccount')}
            </ThemedText>
          </Pressable>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  avatarText: {
    color: '#FFF',
    fontSize: 32,
    fontWeight: '700',
  },
  userName: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    marginBottom: 12,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  sectionTitle: {
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
    marginLeft: 4,
    marginTop: 24,
    opacity: 0.6,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  pickerContainer: {
    padding: 8,
  },
  separator: {
    height: 1,
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  rowPressed: {
    opacity: 0.7,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  rowValue: {
    fontSize: 14,
  },
  actionContainer: {
    marginTop: 40,
    gap: 16,
    alignItems: 'center',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  deleteLink: {
    padding: 8,
  },
  deleteText: {
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});