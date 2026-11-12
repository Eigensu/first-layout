import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID } from '../common/constants';

/**
 * A fresh sign-in with the provider an account was created with, to prove its
 * owner is present.
 *
 * Accounts made with Google or Apple have no password, so the backend asks for
 * a just-issued provider token in its place before it will delete one. The
 * sign-in buttons on the login screens hand their token to a sign-in call;
 * these do the same sheet for a re-check, without the button.
 *
 * Both resolve to the token, or to null when the person dismissed the sheet,
 * which is not an error. Anything else rejects with a message fit to show.
 */

// Loaded defensively for the same reason as GoogleSignInButton: the native
// module is absent in Expo Go and in builds that predate the package.
let googleSignInModule: typeof import('@react-native-google-signin/google-signin') | null = null;
try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    googleSignInModule = require('@react-native-google-signin/google-signin');
} catch {
    googleSignInModule = null;
}

export async function getFreshGoogleIdToken(): Promise<string | null> {
    if (!googleSignInModule || !GOOGLE_WEB_CLIENT_ID) {
        throw new Error('Google sign-in is not available on this device.');
    }
    const { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } = googleSignInModule;
    GoogleSignin.configure({
        webClientId: GOOGLE_WEB_CLIENT_ID,
        iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
        offlineAccess: false,
    });

    try {
        await GoogleSignin.hasPlayServices();
        const response = await GoogleSignin.signIn();
        if (!isSuccessResponse(response)) return null;
        if (!response.data.idToken) {
            throw new Error('Google did not return an ID token. Please try again.');
        }
        return response.data.idToken;
    } catch (error) {
        if (
            isErrorWithCode(error) &&
            (error.code === statusCodes.SIGN_IN_CANCELLED || error.code === statusCodes.IN_PROGRESS)
        ) {
            return null;
        }
        if (error instanceof Error && error.message.startsWith('Google did not')) throw error;
        throw new Error('Google sign-in failed. Please try again.');
    }
}

export async function getFreshAppleIdentityToken(): Promise<string | null> {
    if (Platform.OS !== 'ios' || !(await AppleAuthentication.isAvailableAsync())) {
        throw new Error('Sign in with Apple is not available on this device.');
    }
    try {
        // Confirming who is here needs no name or email, so ask for neither.
        const credential = await AppleAuthentication.signInAsync({ requestedScopes: [] });
        if (!credential.identityToken) {
            throw new Error('Apple did not return an identity token. Please try again.');
        }
        return credential.identityToken;
    } catch (error: any) {
        if (error?.code === 'ERR_REQUEST_CANCELED') return null;
        if (error instanceof Error && error.message.startsWith('Apple did not')) throw error;
        throw new Error('Sign in with Apple failed. Please try again.');
    }
}
