import { useEffect, useState } from 'react';
import { Platform, View, StyleSheet, Alert } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useThemeContext } from '../../theme/ThemeContext';

interface AppleSignInButtonProps {
    onIdentityToken: (identityToken: string, fullName?: string) => void;
    disabled?: boolean;
}

// Joins Apple's ASAuthorizationAppleIDCredential.fullName into a single
// display string. Only present on the very first authorization for a given
// user/app pair — every subsequent sign-in returns null here.
function joinFullName(fullName: AppleAuthentication.AppleAuthenticationFullName | null): string | undefined {
    if (!fullName) return undefined;
    const parts = [fullName.givenName, fullName.familyName].filter(Boolean);
    return parts.length ? parts.join(' ') : undefined;
}

export function AppleSignInButton({ onIdentityToken, disabled = false }: AppleSignInButtonProps) {
    const [available, setAvailable] = useState(false);
    const { isDark } = useThemeContext();

    useEffect(() => {
        if (Platform.OS !== 'ios') return;
        AppleAuthentication.isAvailableAsync().then(setAvailable);
    }, []);

    // Sign in with Apple is iOS-only and requires iOS 13+ / a device signed
    // into iCloud — hide the button entirely rather than show a dead one.
    if (Platform.OS !== 'ios' || !available) return null;

    const handlePress = async () => {
        try {
            const credential = await AppleAuthentication.signInAsync({
                requestedScopes: [
                    AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
                    AppleAuthentication.AppleAuthenticationScope.EMAIL,
                ],
            });

            if (!credential.identityToken) {
                Alert.alert('Apple Sign-In Failed', 'No identity token was returned. Please try again.');
                return;
            }

            onIdentityToken(credential.identityToken, joinFullName(credential.fullName));
        } catch (error: any) {
            // User dismissed the Apple sheet — not an error, nothing to show.
            if (error?.code === 'ERR_REQUEST_CANCELED') {
                return;
            }
            console.log('[AppleSignIn] error:', error);
            Alert.alert('Apple Sign-In Failed', 'Something went wrong. Please try again.');
        }
    };

    const styles = createStyles();

    return (
        <View style={styles.wrapper} pointerEvents={disabled ? 'none' : 'auto'}>
            <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={
                    isDark
                        ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                        : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                }
                cornerRadius={16}
                style={[styles.button, disabled && styles.buttonDisabled]}
                onPress={handlePress}
            />
        </View>
    );
}

const createStyles = () => StyleSheet.create({
    wrapper: {
        marginBottom: 16,
    },
    button: {
        // Apple HIG: minimum touch height of 44pt; match the height of the
        // adjacent Google button (14pt vertical padding + ~22pt text).
        height: 50,
        width: '100%',
    },
    buttonDisabled: {
        opacity: 0.6,
    },
});
