import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, ScrollView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/core/hooks/useAuth';
import { authService } from '../../src/services/authService';
import { useThemeContext } from '../../src/theme/ThemeContext';
import { GoogleSignInButton } from '../../src/components/auth/GoogleSignInButton';
import { AppleSignInButton } from '../../src/components/auth/AppleSignInButton';
import { GlassButton } from '../../src/components/ui/GlassButton';

export default function SignupScreen() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();
  const { theme } = useThemeContext();

  const validatePassword = (pwd: string): string | null => {
    if (pwd.length < 8) {
      return 'Password must be at least 8 characters';
    }
    if (!/[A-Z]/.test(pwd)) {
      return 'Password must contain an uppercase letter';
    }
    if (!/[0-9]/.test(pwd)) {
      return 'Password must contain a number';
    }
    return null;
  };

  const handleSignup = async () => {
    if (!username.trim() || !email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      Alert.alert('Error', passwordError);
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const response = await authService.signup({
        username: username.trim(),
        email: email.trim(),
        password,
        full_name: fullName.trim() || undefined,
        mobile: mobile.trim() || undefined,
      });

      login(response.access_token);
      router.replace('/(tabs)');
    } catch (error: any) {
      console.error('Signup failed:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Signup failed. Please try again.';
      Alert.alert('Signup Failed', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleIdToken = async (idToken: string) => {
    setLoading(true);
    try {
      const response = await authService.loginWithGoogle(idToken);
      login(response.access_token, response.refresh_token);
      router.replace('/(tabs)');
    } catch (error: any) {
      const errorMessage = error.message || 'Google sign-in failed. Please try again.';
      Alert.alert('Google Sign-In Failed', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleAppleIdentityToken = async (identityToken: string, fullName?: string) => {
    setLoading(true);
    try {
      const response = await authService.loginWithApple(identityToken, fullName);
      login(response.access_token, response.refresh_token);
      router.replace('/(tabs)');
    } catch (error: any) {
      const errorMessage = error.message || 'Apple sign-in failed. Please try again.';
      Alert.alert('Apple Sign-In Failed', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const styles = createStyles(theme);

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView 
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.formContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Join the fantasy league</Text>
          </View>

          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Choose a username *"
              placeholderTextColor={theme.text.subtle}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
            />

            <TextInput
              style={styles.input}
              placeholder="Enter your email *"
              placeholderTextColor={theme.text.subtle}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <TextInput
              style={styles.input}
              placeholder="Enter your full name"
              placeholderTextColor={theme.text.subtle}
              value={fullName}
              onChangeText={setFullName}
            />

            <TextInput
              style={styles.input}
              placeholder="Enter your mobile number"
              placeholderTextColor={theme.text.subtle}
              value={mobile}
              onChangeText={setMobile}
              keyboardType="phone-pad"
            />

            <TextInput
              style={styles.input}
              placeholder="Create a password *"
              placeholderTextColor={theme.text.subtle}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            <Text style={styles.passwordHint}>
              Password should be at least 8 characters including a number and an uppercase letter.
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Confirm your password *"
              placeholderTextColor={theme.text.subtle}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
            />

            <GlassButton
              title="Create Account"
              onPress={handleSignup}
              loading={loading}
              size="lg"
              fullWidth
              style={{ marginBottom: 16 }}
              textStyle={{ fontSize: 18 }}
            />

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            <AppleSignInButton onIdentityToken={handleAppleIdentityToken} disabled={loading} />
            <GoogleSignInButton onIdToken={handleGoogleIdToken} disabled={loading} />

            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => router.back()}
            >
              <Text style={styles.linkText}>Already have an account? <Text style={styles.linkTextBold}>Sign In</Text></Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg.body,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  formContainer: {
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: theme.text.main,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: theme.text.muted,
    textAlign: 'center',
  },
  form: {
    backgroundColor: theme.bg.card,
    borderRadius: 24,
    padding: 24,
    shadowColor: theme.shadow.softPink,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  input: {
    backgroundColor: theme.bg.cardSoft,
    borderWidth: 1,
    borderColor: theme.border.subtle,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
    fontSize: 16,
    color: theme.text.main,
  },
  passwordHint: {
    fontSize: 12,
    color: theme.text.muted,
    marginBottom: 16,
    marginTop: -8,
    paddingHorizontal: 4,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.border.subtle,
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 12,
    fontWeight: '600',
    color: theme.text.subtle,
  },
  linkButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  linkText: {
    color: theme.text.muted,
    fontSize: 16,
  },
  linkTextBold: {
    color: theme.accent.pink.primary,
    fontWeight: '600',
  },
});
