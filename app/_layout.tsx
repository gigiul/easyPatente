import { useAuth } from '@/hooks/useAuth';
import { useColorScheme } from '@/hooks/useColorScheme';
import '@/i18n';
import { fetchLanguages } from '@/queries/languages';
import { fetchUserProfile } from '@/queries/user';
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
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
