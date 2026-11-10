import { useState } from 'react';
import { TouchableOpacity, Text, View, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID } from '../../common/constants';
import { useThemeContext } from '../../theme/ThemeContext';

// Loaded defensively: the native RNGoogleSignin module only exists once a dev
// client / build has been recompiled after this package was added (and never
// in Expo Go). Importing it eagerly would throw a TurboModuleRegistry
// invariant violation and crash the whole login/signup screen on any client
// that predates that rebuild, so fail soft and hide the button instead.
let googleSignInModule: typeof import('@react-native-google-signin/google-signin') | null = null;
try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    googleSignInModule = require('@react-native-google-signin/google-signin');
} catch {
    googleSignInModule = null;
}

if (googleSignInModule && GOOGLE_WEB_CLIENT_ID) {
    googleSignInModule.GoogleSignin.configure({
        webClientId: GOOGLE_WEB_CLIENT_ID,
        iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
        offlineAccess: false,
    });
}

interface GoogleSignInButtonProps {
    onIdToken: (idToken: string) => void;
    disabled?: boolean;
}

export function GoogleSignInButton({ onIdToken, disabled = false }: GoogleSignInButtonProps) {
    const [loading, setLoading] = useState(false);
    const { theme } = useThemeContext();

    // Sign-in isn't usable in this environment — either the native module
    // isn't built in yet (see comment above), or no client ID is configured.
    if (!googleSignInModule || !GOOGLE_WEB_CLIENT_ID) return null;

    const { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } = googleSignInModule;

    const handlePress = async () => {
        setLoading(true);
        try {
            await GoogleSignin.hasPlayServices();
            const response = await GoogleSignin.signIn();

            if (isSuccessResponse(response)) {
                if (response.data.idToken) {
                    onIdToken(response.data.idToken);
                } else {
                    Alert.alert('Google Sign-In Failed', 'No ID token was returned. Please try again.');
                }
            }
            // response.type === 'cancelled' -> user dismissed the picker, nothing to do
        } catch (error) {
            console.log('[GoogleSignIn] raw error:', error);
            console.log('[GoogleSignIn] isErrorWithCode:', isErrorWithCode(error));
            if (isErrorWithCode(error)) {
                console.log('[GoogleSignIn] error.code:', error.code);
                if (error.code === statusCodes.SIGN_IN_CANCELLED || error.code === statusCodes.IN_PROGRESS) {
                    return;
                }
                if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
                    Alert.alert('Google Sign-In Failed', 'Google Play Services is not available on this device.');
                    return;
                }
            }
            Alert.alert('Google Sign-In Failed', 'Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const styles = createStyles(theme);

    return (
        <TouchableOpacity
            style={[styles.button, (disabled || loading) && styles.buttonDisabled]}
            onPress={handlePress}
            disabled={disabled || loading}
        >
            {loading ? (
                <ActivityIndicator color={theme.text.main} />
            ) : (
                <View style={styles.content}>
                    <Ionicons name="logo-google" size={20} color={theme.text.main} />
                    <Text style={styles.text}>Continue with Google</Text>
                </View>
            )}
        </TouchableOpacity>
    );
}

const createStyles = (theme: any) => StyleSheet.create({
    button: {
        backgroundColor: theme.bg.cardSoft,
        borderWidth: 1,
        borderColor: theme.border.subtle,
        borderRadius: 16,
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    buttonDisabled: {
        opacity: 0.6,
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    text: {
        fontSize: 16,
        fontWeight: '600',
        color: theme.text.main,
    },
});
