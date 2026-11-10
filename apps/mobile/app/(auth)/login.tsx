import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
  Linking,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/core/hooks/useAuth";
import { authService } from "../../src/services/authService";
import { useThemeContext } from "../../src/theme/ThemeContext";
import { useTournamentStore } from "../../src/core/store/tournamentStore";
import { passwordResetUrl } from "../../src/services/tournamentService";
import { GoogleSignInButton } from "../../src/components/auth/GoogleSignInButton";
import { AppleSignInButton } from "../../src/components/auth/AppleSignInButton";
import { TournamentPickerModal } from "../../src/components/home/TournamentPickerModal";
import { GlassButton } from "../../src/components/ui/GlassButton";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const { login } = useAuth();
  const { selectedTournament } = useTournamentStore();
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { theme, isDark } = useThemeContext();
  const insets = useSafeAreaInsets();

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Error", "Please enter email and password");
      return;
    }

    setLoading(true);
    try {
      const response = await authService.login(email.trim(), password);
      login(response.access_token, response.refresh_token);
      // Return the user to whatever action sent them here (e.g. a contest), or
      // fall back to the landing.
      router.replace((next as string) || "/(tabs)");
    } catch (error: any) {
      // Handle different error types with user-friendly messages
      let errorMessage = "Login failed. Please check your credentials.";

      if (error.status === 401 || error.response?.status === 401) {
        errorMessage = "Invalid email or password";
      } else if (error.status === 429) {
        // Rate-limited: authService passes on the backend's "try again in N
        // minutes". It has no response, so it must come before the network case.
        errorMessage = error.message;
      } else if (error.status === 403 || error.response?.status === 403) {
        errorMessage = "This account has been deactivated";
      } else if (error.status === 404 || error.response?.status === 404) {
        errorMessage = "Account not found";
      } else if (error.code === "NETWORK_ERROR" || !error.response) {
        errorMessage =
          "Network error. Please check your connection and try again.";
      } else if (error.status >= 500 || error.response?.status >= 500) {
        errorMessage = "Server error. Please try again later.";
      } else if (error.message) {
        errorMessage = error.message;
      }

      Alert.alert("Login Failed", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleIdToken = async (idToken: string) => {
    setLoading(true);
    try {
      const response = await authService.loginWithGoogle(idToken);
      login(response.access_token, response.refresh_token);
      router.replace((next as string) || "/(tabs)");
    } catch (error: any) {
      let errorMessage = "Google sign-in failed. Please try again.";

      if (error.status === 429) {
        errorMessage = error.message;
      } else if (error.status === 403 || error.response?.status === 403) {
        errorMessage = "This account has been deactivated";
      } else if (error.code === "NETWORK_ERROR" || !error.response) {
        errorMessage =
          "Network error. Please check your connection and try again.";
      } else if (error.message) {
        errorMessage = error.message;
      }

      Alert.alert("Google Sign-In Failed", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleAppleIdentityToken = async (
    identityToken: string,
    fullName?: string,
  ) => {
    setLoading(true);
    try {
      const response = await authService.loginWithApple(
        identityToken,
        fullName,
      );
      login(response.access_token, response.refresh_token);
      router.replace((next as string) || "/(tabs)");
    } catch (error: any) {
      let errorMessage = "Apple sign-in failed. Please try again.";

      if (error.status === 429) {
        errorMessage = error.message;
      } else if (error.status === 403 || error.response?.status === 403) {
        errorMessage = "This account has been deactivated";
      } else if (error.code === "NETWORK_ERROR" || !error.response) {
        errorMessage =
          "Network error. Please check your connection and try again.";
      } else if (error.message) {
        errorMessage = error.message;
      }

      Alert.alert("Apple Sign-In Failed", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // The app has no reset screens: the tournament's website does the reset,
  // and the new password works here too, since one account covers every
  // tournament. The phone's browser rather than an in-app one, which would
  // need a native module and so a store release instead of an OTA update.
  const handleForgotPassword = async () => {
    const url = selectedTournament ? passwordResetUrl(selectedTournament) : null;
    if (!url) {
      // The reset page lives on a tournament's site, so one has to be chosen.
      setPickerOpen(true);
      return;
    }
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(
        "Couldn't open the browser",
        `Reset your password at ${url}`,
      );
    }
  };

  const styles = createStyles(theme);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.formContainer}>
          <View style={[styles.header, { paddingTop: insets.top }]}>
            <Image
              source={
                isDark
                  ? require("../../assets/logo-dark.png")
                  : require("../../assets/logo-light.png")
              }
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Ready to Play?</Text>
          </View>

          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={theme.text.subtle}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Password"
                placeholderTextColor={theme.text.subtle}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Ionicons
                  name={showPassword ? "eye-off" : "eye"}
                  size={20}
                  color={theme.text.subtle}
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.forgotButton}
              onPress={handleForgotPassword}
              accessibilityRole="link"
              accessibilityHint="Opens the password reset page in your browser"
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>

            {/* Tournament Selection Display */}
            {selectedTournament && (
              <View style={styles.tournamentCard}>
                <View style={styles.tournamentInfo}>
                  <View style={styles.tournamentHeader}>
                    <Ionicons
                      name="trophy"
                      size={20}
                      color={theme.accent.pink.primary}
                    />
                    <Text style={styles.tournamentLabel}>Playing in</Text>
                  </View>
                  <Text style={styles.tournamentName}>
                    {selectedTournament.title}
                  </Text>
                  <Text style={styles.tournamentDescription}>
                    {selectedTournament.game_name.toUpperCase()}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.switchButton}
                  onPress={() => setPickerOpen(true)}
                >
                  <Ionicons
                    name="swap-horizontal"
                    size={16}
                    color={theme.accent.pink.primary}
                  />
                  <Text style={styles.switchButtonText}>Switch</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={{ marginBottom: 16 }}>
              <GlassButton
                title="Login"
                onPress={handleLogin}
                loading={loading}
                size="md"
                fullWidth
                style={{ height: 50 }}
                textStyle={{ fontSize: 16 }}
              />
            </View>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            <AppleSignInButton
              onIdentityToken={handleAppleIdentityToken}
              disabled={loading}
            />
            <GoogleSignInButton
              onIdToken={handleGoogleIdToken}
              disabled={loading}
            />

            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => router.push("/(auth)/signup")}
            >
              <Text style={styles.linkText}>
                Don't have an account? Sign up
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => router.replace("/(tabs)")}
            >
              <Text style={styles.browseText}>Browse without logging in</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Lets the user pick which tournament they're logging in to, including
          right after a switch sent them here. */}
      <TournamentPickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.bg.body,
    },
    scrollContainer: {
      flexGrow: 1,
    },
    formContainer: {
      paddingHorizontal: 24,
      paddingVertical: 20,
    },
    header: {
      alignItems: "center",
      marginBottom: 16,
    },
    logo: {
      width: 280,
      height: 140,
      marginBottom: 0,
      alignSelf: "center",
    },
    title: {
      fontSize: 20,
      fontWeight: "600",
      color: theme.text.main,
      marginBottom: 2,
      textAlign: "center",
    },
    subtitle: {
      fontSize: 14,
      color: theme.text.muted,
      textAlign: "center",
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
    passwordContainer: {
      position: "relative",
      marginBottom: 16,
    },
    passwordInput: {
      backgroundColor: theme.bg.cardSoft,
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 14,
      paddingRight: 50,
      fontSize: 16,
      color: theme.text.main,
    },
    eyeButton: {
      position: "absolute",
      right: 16,
      top: 11,
      padding: 4,
    },
    forgotButton: {
      alignSelf: "flex-end",
      marginTop: -8,
      marginBottom: 16,
      paddingVertical: 4,
    },
    forgotText: {
      color: theme.accent.pink.primary,
      fontSize: 14,
      fontWeight: "500",
    },
    dividerRow: {
      flexDirection: "row",
      alignItems: "center",
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
      fontWeight: "600",
      color: theme.text.subtle,
    },
    linkButton: {
      alignItems: "center",
      paddingVertical: 8,
    },
    linkText: {
      color: theme.accent.pink.primary,
      fontSize: 16,
      fontWeight: "500",
    },
    browseText: {
      color: theme.text.subtle,
      fontSize: 14,
      fontWeight: "500",
    },
    tournamentCard: {
      backgroundColor: theme.bg.elevated,
      borderRadius: 16,
      padding: 16,
      marginBottom: 24,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderWidth: 1,
      borderColor: theme.accent.pink.soft + "40",
    },
    tournamentInfo: {
      flex: 1,
    },
    tournamentHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 4,
    },
    tournamentLabel: {
      fontSize: 12,
      color: theme.text.subtle,
      marginLeft: 6,
      fontWeight: "500",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    tournamentName: {
      fontSize: 18,
      fontWeight: "bold",
      color: theme.text.main,
      marginBottom: 2,
    },
    tournamentDescription: {
      fontSize: 14,
      color: theme.text.muted,
    },
    switchButton: {
      backgroundColor: theme.accent.pink.soft + "30",
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 12,
      flexDirection: "row",
      alignItems: "center",
      marginLeft: 12,
    },
    switchButtonText: {
      color: theme.accent.pink.primary,
      fontSize: 14,
      fontWeight: "600",
      marginLeft: 4,
    },
  });
