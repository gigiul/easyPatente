import { useAuth } from '@/hooks/useAuth';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useLanguage } from '@/hooks/useLanguage';
import i18n from '@/i18n';
import { fetchLanguages } from '@/queries/languages';
import { fetchUserProfile } from '@/queries/user';
import { useFeatureFlagsStore } from '@/store/featureFlags';
import { useLanguagesStore } from '@/store/languages';
import { useUserProfileStore } from '@/store/user';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import Head from 'expo-router/head';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';


// This is the main layout of the app
// It wraps your pages with the providers they need
export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const userProfile = useUserProfileStore((state) => state.user);
  const languages = useLanguagesStore((state) => state.languages);
  const { setSecondaryLanguagePreference } = useLanguage();
  

  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    // Initial fetch of languages - can be done without session now that RLS is open
    fetchLanguages().catch(console.error);
  }, []);

  useEffect(() => {
    // Fetch profile and feature flags whenever session changes (after login)
    if (session?.user?.id) {
      fetchUserProfile(session.user.id).catch(console.error);
      useFeatureFlagsStore.getState().fetchFlags();
    }
  }, [session]);

    useEffect(() => {
    // retrieve userProfile languages if set
    const { lang_primary, lang_secondary } = userProfile || {};
    if (lang_primary) {
      i18n.changeLanguage(lang_primary);
    }

    if (lang_secondary) {
      setSecondaryLanguagePreference(lang_secondary);
    }

    // Only set default language if profile is loaded AND has no lang_primary
    // This prevents Arabic from being set as default when languages load before profile
    if (userProfile && !lang_primary && languages.length > 0) {
      const setDefaultLanguage = async () => {
        const defaultLang = languages.find((l) => l.is_default) || languages[0];
        await i18n.changeLanguage(defaultLang.code);
      };
      setDefaultLanguage();
    }
  }, [languages, userProfile]);


  useEffect(() => {
    if (loading) {
      return;
    }

    const firstSegment = segments[0] as string;
    const inLoginScreen = firstSegment === 'login';
    const inSignupScreen = firstSegment === 'signup';
    const inTermsScreen = firstSegment === 'terms';
    const inPrivacyScreen = firstSegment === 'privacy';

    if (session) {
      if (inLoginScreen || inSignupScreen) {
        router.replace('/(tabs)');
      }
    } else {
      if (!inLoginScreen && !inSignupScreen && !inTermsScreen && !inPrivacyScreen) {
        router.replace('/login');
      }
    }
  }, [session, loading, segments]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = 'Quiz Patente 2026';
    }
  }, []);

  if (!loaded || loading) {
    // Async font loading only occurs in development.
    // Wait for auth to finish loading to prevent unauthenticated API requests.
    return null;
  }

  return (
    <>
      <Head>
        <title>Quiz Patente 2026</title>
        <meta name="description" content="Quiz patente multilingua" />
        <meta name="theme-color" content="#2563EB" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Quiz Patente" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png" />
      </Head>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="signup" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="quiz" options={{ headerShown: false }} />
        <Stack.Screen name="quizBatch" options={{ headerShown: false }} />
        <Stack.Screen name="examQuiz" options={{ headerShown: false }} />
        <Stack.Screen name="terms" options={{ headerShown: false }} />
        <Stack.Screen name="privacy" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
    </>
  );
}
