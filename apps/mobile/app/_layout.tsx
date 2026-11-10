import '../global.css';
import { useEffect } from 'react';
import { Text, TextInput } from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '../src/theme/ThemeContext';
import { DebugPanel } from '../src/components/DebugPanel';
import { MobileNumberGate } from '../src/components/auth/MobileNumberGate';
import { TournamentBootstrap } from '../src/core/hooks/useTournamentBootstrap';
import { useApplyUpdatesOnLaunch } from '../src/core/hooks/useApplyUpdatesOnLaunch';
import { BouncingDotsLoader } from '../src/components/loading/BouncingDotsLoader';
import { useFonts } from '../src/hooks/useFonts';
import { queryClient } from '../src/lib/queryClient';

// Keep the native splash (dark, matches BouncingDotsLoader below) up until
// fonts are ready, instead of letting it auto-hide into a blank frame.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const fontsLoaded = useFonts();
  useApplyUpdatesOnLaunch();

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  // Set default font family for all Text and TextInput components
  useEffect(() => {
    if (fontsLoaded) {
      // DEMO: Saira Semi Condensed app-wide. Clean modern sporty face that
      // reads well as body too, so plain text needs no extra styling here — the
      // banner flourishes (uppercase + letter spacing) live in <BannerText>.
      // `defaultProps` on function components isn't in the current React types,
      // but RN's Text/TextInput still honor it at runtime.
      const TextAny = Text as any;
      const defaultProps = TextAny.defaultProps || {};
      TextAny.defaultProps = {
        ...defaultProps,
        style: [{ fontFamily: 'SairaSemiCondensed-Regular' }, defaultProps.style],
      };

      const TextInputAny = TextInput as any;
      const defaultTextInputProps = TextInputAny.defaultProps || {};
      TextInputAny.defaultProps = {
        ...defaultTextInputProps,
        style: [{ fontFamily: 'SairaSemiCondensed-Regular' }, defaultTextInputProps.style],
      };
    }
  }, [fontsLoaded]);

  // Show loading screen while fonts are loading. ThemeProvider isn't mounted
  // yet, so pass the dark-body palette inline to match the splash that follows.
  if (!fontsLoaded) {
    return (
      <BouncingDotsLoader
        logoSource={require('../assets/logo-dark.png')}
        bgColor="#1a073e"
        dotColor="#c8badf"
        textColor="#c0b6e1"
      />
    );
  }

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          {/*
            The app is publicly browsable — no tournament gate and no auth gate.
            Login is enforced per-action by the individual screens, and the
            auth screens navigate explicitly on success, so no global redirect
            logic is needed here.
          */}
          {/* Keeps a tournament selected app-wide — every API call names the
              selected tournament, which is how the one backend knows whose
              data to serve, so an empty selection would leave any screen
              unable to load. */}
          <TournamentBootstrap />
          <Stack screenOptions={{ headerShown: false }} />
          {/* One-time mobile number prompt for accounts that don't have one
              yet (Google sign-in never provides it). */}
          <MobileNumberGate />
          <DebugPanel />
        </SafeAreaProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
