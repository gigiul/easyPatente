import { useAuth } from '@/hooks/useAuth';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useLanguage } from '@/hooks/useLanguage';
import i18n from '@/i18n';
import { fetchLanguages } from '@/queries/languages';
import { fetchUserProfile } from '@/queries/user';
import { useLanguagesStore } from '@/store/languages';
import { useUserProfileStore } from '@/store/user';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
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
      // Fetch user profile and languages
      const fetchData = async () => {
        await fetchUserProfile();
        await fetchLanguages();
      };
      fetchData();
  }, []);

    useEffect(() => {
    // retrieve userProfile languages if set
    const { lang_primary, lang_secondary } = userProfile || {};
    if (lang_primary) {
      i18n.changeLanguage(lang_primary);
    }

    if (lang_secondary) {
      setSecondaryLanguagePreference(lang_secondary);
    }

    // If no primary language is set, default to the first available language
    if (!lang_primary && languages.length > 0) {
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

    const inLoginScreen = segments[0] === 'login';
    const inSignupScreen = segments[0] === 'signup';
    const inTabsScreen = segments[0] === '(tabs)';

    if (session) {
      if (inLoginScreen || inSignupScreen) {
        router.replace('/(tabs)');
      }
    } else {
      if (!inLoginScreen && !inSignupScreen) {
        router.replace('/login');
      }
    }
  }, [session, loading, segments]);

  if (!loaded) {
    // Async font loading only occurs in development.
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="signup" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="quiz" options={{ headerShown: false }} />
        <Stack.Screen name="quizBatch" options={{ headerShown: false }} />
        <Stack.Screen name="examQuiz" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
