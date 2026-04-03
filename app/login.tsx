import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/hooks/useAuth';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useTranslation } from '@/hooks/useTranslation';

export default function LoginScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputBackgroundColor = useThemeColor({ light: '#f5f5f5', dark: '#1c1c1e' }, 'background');
  const textColor = useThemeColor({}, 'text');
  const iconColor = useThemeColor({}, 'icon');
  const placeholderColor = useThemeColor({ light: '#999', dark: '#666' }, 'icon');
  const errorBackgroundColor = useThemeColor({ light: '#FEE2E2', dark: '#3D1A1A' }, 'background');
  const errorTextColor = '#EF4444'; // Semantic Danger Color
  const primaryColor = '#2563EB'; // Semantic Primary Color

  const handleLogin = async () => {
    if (!email || !password) {
      setError(t('auth.login.errors.fillFields'));
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const { error: signInError } = await signIn(email, password);
      
      if (signInError) {
        setError(signInError.message);
        return;
      }

      // Navigate to main app
      router.replace('/(tabs)');
    } catch (err) {
      console.error('Login error:', err);
      setError(t('auth.login.errors.unexpected'));
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = () => {
    router.replace('/signup');
  };

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        <View style={styles.header}>
          <ThemedText type="title" style={styles.title}>{t('auth.login.title')}</ThemedText>
          <ThemedText style={styles.subtitle}>{t('auth.login.subtitle')}</ThemedText>
        </View>

        <View style={styles.form}>
          {error && (
            <View style={[styles.errorContainer, { backgroundColor: errorBackgroundColor }]}>
              <ThemedText style={[styles.errorText, { color: errorTextColor }]}>{error}</ThemedText>
            </View>
          )}

          <View style={[styles.inputContainer, { backgroundColor: inputBackgroundColor }]}>
            <Ionicons name="mail-outline" size={20} color={iconColor} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: textColor }]}
              placeholder={t('auth.login.email')}
              placeholderTextColor={placeholderColor}
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                setError(null);
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              editable={!loading}
            />
          </View>

          <View style={[styles.inputContainer, { backgroundColor: inputBackgroundColor }]}>
            <Ionicons name="lock-closed-outline" size={20} color={iconColor} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: textColor }]}
              placeholder={t('auth.login.password')}
              placeholderTextColor={placeholderColor}
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                setError(null);
              }}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="password"
              editable={!loading}
            />
            <Pressable
              onPress={() => setShowPassword(!showPassword)}
              style={({ pressed }) => [
              styles.eyeIcon,
              pressed && { opacity: 0.7, transform: [{ scale: 0.96 }] }
            ]}
              disabled={loading}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={iconColor}
              />
            </Pressable>
          </View>

          <Pressable 
            style={({ pressed }) => [
              styles.forgotPassword,
              pressed && { opacity: 0.7 }
            ]}
            disabled={loading}
          >
            <ThemedText style={[styles.forgotPasswordText, { color: primaryColor }]}>{t('auth.login.forgotPassword')}</ThemedText>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.loginButton,
              { backgroundColor: primaryColor },
              pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 },
              loading && styles.loginButtonDisabled,
            ]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.loginButtonText}>{t('auth.login.signIn')}</ThemedText>
            )}
          </Pressable>

          <View style={styles.signUpContainer}>
            <ThemedText style={styles.signUpText}>{t('auth.login.noAccount')} </ThemedText>
            <Pressable 
              onPress={handleSignUp}
              disabled={loading}
              style={({ pressed }) => pressed && { opacity: 0.7 }}
            >
              <ThemedText style={[styles.signUpLink, { color: primaryColor }]}>{t('auth.login.signUp')}</ThemedText>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 24,
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.7,
  },
  form: {
    paddingHorizontal: 24,
  },
  errorContainer: {
    backgroundColor: '#ffebee',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    fontWeight: '500',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    marginBottom: 16,
    paddingHorizontal: 16,
    height: 56,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    height: '100%',
  },
  eyeIcon: {
    padding: 8,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 24,
  },
  forgotPasswordText: {
    fontSize: 14,
    fontWeight: '500',
  },
  loginButton: {
    borderRadius: 12,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  loginButtonDisabled: {
    opacity: 0.5,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  signUpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signUpText: {
    fontSize: 14,
  },
  signUpLink: {
    fontSize: 14,
    fontWeight: '600',
  },
}); 