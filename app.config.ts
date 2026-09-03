import dotenv from 'dotenv';
import { ConfigContext, ExpoConfig } from 'expo/config';

// Expo carica già EXPO_PUBLIC_* da .env, ma per --clear serve fallback
dotenv.config({ override: false });

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
    name: 'Quiz Patente 2026',
    slug: 'easyPatente',
    description: 'Quiz patente multilingua',
    version: '1.0.10',
    orientation: 'portrait',
    icon: './assets/images/IOSquizpatente.png',
    scheme: 'easypatente',
    userInterfaceStyle: 'automatic',
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.gigiul.easyPatente',
    },
    android: {
      package: 'com.gigiul.easyPatente',
      adaptiveIcon: {
        foregroundImage: './assets/images/android-quizpatente.png',
        backgroundColor: '#f5a4cc',
      },
    },
    web: {
      bundler: 'metro',
      output: 'static',
      name: 'Quiz Patente 2026',
      shortName: 'QuizPatente',
      description: 'Quiz patente multilingua',
      favicon: './assets/images/IOSquizpatente.png',
      backgroundColor: '#f5a4cc',
      themeColor: '#2563EB',
      display: 'standalone',
      scope: '/',
      startUrl: '/',
    },
    plugins: [
      'expo-router',
      [
        'expo-splash-screen',
        {
          image: './assets/images/splash-icon.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: '#f5a4cc',
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      router: {},
      eas: {
        projectId: 'f14f10d2-5092-4112-8da1-7fdbadd07ae4',
      },
      // Serve solo a rendere disponibili i valori in fase di build/config.
      // Il client Supabase vero e proprio legge da `lib/supabase.ts`.
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '',
      supabaseAnonKey:
        process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
        process.env.SUPABASE_PUBLISHABLE_KEY ??
        process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
        process.env.SUPABASE_ANON_KEY ??
        '',
      supabaseStorageUrl:
        process.env.EXPO_PUBLIC_SUPABASE_STORAGE_URL ??
        process.env.SUPABASE_STORAGE_URL ??
        '',
    },
  });
