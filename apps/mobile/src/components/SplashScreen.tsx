import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { useThemeContext } from '../theme';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../core/store/authStore';
import { useTournamentStore } from '../core/store/tournamentStore';
import { userService } from '../services/userService';
import { carouselService } from '../services/carouselService';
import { BouncingDotsLoader } from './loading/BouncingDotsLoader';

interface SplashScreenProps {
  onFinish: () => void;
}

// Keep the loader on screen at least this long so it never just flashes.
const MIN_SPLASH_MS = 1400;

export const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  const { theme, isDark } = useThemeContext();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuthStore();
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const [isComplete, setIsComplete] = useState(false);

  // Warm the cache so the landing paints with content rather than empty
  // sections. Tournaments aren't fetched here — TournamentBootstrap mounts at
  // the root and owns that request, so duplicating it would just cost a second
  // round trip against the same cache key.
  const preloadData = async () => {
    const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T | null> =>
      Promise.race([
        promise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
      ]);

    const tasks: Promise<unknown>[] = [
      // Floor so the splash animation has room to breathe.
      new Promise<void>((resolve) => setTimeout(resolve, MIN_SPLASH_MS)),
    ];

    // Public content — guests see the carousel on the landing too. With nothing
    // selected yet there's none to warm: useCarousel fetches once there is.
    const slug = useTournamentStore.getState().selectedTournament?.slug;
    if (slug) {
      tasks.push(
        withTimeout(
          carouselService
            .getCarouselImages(slug)
            .then((c) => c && queryClient.setQueryData(['carousel', slug], c)),
          2000
        ).catch((e) => console.warn('Preload carousel failed:', e))
      );
    }

    if (isAuthenticated) {
      tasks.push(
        withTimeout(
          userService
            .getProfile()
            .then((p) => p && queryClient.setQueryData(['user', 'profile'], p)),
          3000
        ).catch((e) => console.warn('Preload profile failed:', e))
      );
    }

    try {
      await Promise.all(tasks);
    } catch (error) {
      console.warn('Preload failed, continuing anyway:', error);
    }
  };

  useEffect(() => {
    preloadData().then(() => setIsComplete(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isComplete) return;
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 450,
      useNativeDriver: true,
    }).start(() => onFinish());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isComplete]);

  return (
    <Animated.View style={[styles.fill, { opacity: fadeAnim }]}>
      <BouncingDotsLoader
        logoSource={
          isDark
            ? require('../../assets/logo-dark.png')
            : require('../../assets/logo-light.png')
        }
        bgColor={theme.bg.body}
        dotColor={theme.accent.pink.primary}
        textColor={theme.text.muted}
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
