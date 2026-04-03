import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/hooks/useAuth';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useTranslation } from '@/hooks/useTranslation';
import { fetchAllowedDomains } from '@/lib/emailValidation';

export default function SignUpScreen() {
  const router = useRouter();
  const { signUp } = useAuth();
  const { t } = useTranslation();
  
  // Fetch allowed domains on mount to keep UI synchronized
  useEffect(() => {
    fetchAllowedDomains();
  }, []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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

  const handleSignUp = async () => {
    if (!email || !password || !confirmPassword) {
      setError(t('auth.signup.errors.fillFields'));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('auth.signup.errors.passwordsMatch'));
      return;
    }

    if (password.length < 6) {
      setError(t('auth.signup.errors.passwordLength'));
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const { error: signUpError } = await signUp(email, password);
      
      if (signUpError) {
        // If the error message is an i18n key, translate it
        const errorMessage = signUpError.message.startsWith('auth.') 
          ? t(signUpError.message as any) 
          : signUpError.message;
        setError(errorMessage);
        return;
      }

      // Show success message and navigate to login
      router.replace('/login');
    } catch (err) {
      setError(t('auth.signup.errors.unexpected'));
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = () => {
    router.replace('/login');
  };

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        <View style={styles.header}>
          <ThemedText type="title" style={styles.title}>{t('auth.signup.title')}</ThemedText>
          <ThemedText style={styles.subtitle}>{t('auth.signup.subtitle')}</ThemedText>
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
              placeholder={t('auth.signup.email')}
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
              placeholder={t('auth.signup.password')}
              placeholderTextColor={placeholderColor}
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                setError(null);
              }}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="password-new"
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

          <View style={[styles.inputContainer, { backgroundColor: inputBackgroundColor }]}>
            <Ionicons name="lock-closed-outline" size={20} color={iconColor} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: textColor }]}
              placeholder={t('auth.signup.confirmPassword')}
              placeholderTextColor={placeholderColor}
              value={confirmPassword}
              onChangeText={(text) => {
                setConfirmPassword(text);
                setError(null);
              }}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="password-new"
              editable={!loading}
            />
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.signUpButton,
              { backgroundColor: primaryColor },
              pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 },
              loading && styles.signUpButtonDisabled,
            ]}
            onPress={handleSignUp}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.signUpButtonText}>{t('auth.signup.createAccount')}</ThemedText>
            )}
          </Pressable>

          <View style={styles.loginContainer}>
            <ThemedText style={styles.loginText}>{t('auth.signup.hasAccount')} </ThemedText>
            <Pressable 
              onPress={handleLogin}
              disabled={loading}
              style={({ pressed }) => pressed && { opacity: 0.7 }}
            >
              <ThemedText style={[styles.loginLink, { color: primaryColor }]}>{t('auth.signup.signIn')}</ThemedText>
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
  signUpButton: {
    borderRadius: 12,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  signUpButtonDisabled: {
    opacity: 0.5,
  },
  signUpButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginText: {
    fontSize: 14,
  },
  loginLink: {
    fontSize: 14,
    fontWeight: '600',
  },
}); 