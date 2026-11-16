import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Animated,
  Easing,
  StyleSheet,
  ImageSourcePropType,
} from 'react-native';
import { fonts } from '../../utils/fonts';

interface BouncingDotsLoaderProps {
  /** Logo image rendered above the dots */
  logoSource: ImageSourcePropType;
  /** Screen background */
  bgColor: string;
  /** Dot + accent color */
  dotColor: string;
  /** Caption text color */
  textColor: string;
  /** Caption shown beneath the dots */
  text?: string;
  /** Number of dots in the wave */
  dotCount?: number;
}

const DOT_TRAVEL = 12; // px the dot lifts on the bounce
const UP_MS = 300;
const DOWN_MS = 300;
const REST_MS = 420; // pause after a dot lands, keeps the cycle length constant
const STAGGER_MS = 130; // offset between adjacent dots -> the "wave"

/**
 * Sport-agnostic loading animation: a static logo with a row of dots that
 * bounce in a staggered wave. Pure Animated API (no extra libraries) and
 * theme-agnostic — callers pass colors so it works both inside the themed
 * app and in the pre-theme font-loading fallback.
 */
export const BouncingDotsLoader: React.FC<BouncingDotsLoaderProps> = ({
  logoSource,
  bgColor,
  dotColor,
  textColor,
  text = 'Connecting to wallearena',
  dotCount = 4,
}) => {
  const dots = useRef(
    Array.from({ length: dotCount }, () => new Animated.Value(0))
  ).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    // Gentle logo entrance, then it stays still per the chosen design.
    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        tension: 60,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();

    // Each dot runs the same loop, started on a stagger so they ripple.
    const loops = dots.map((dot) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(dot, {
            toValue: 1,
            duration: UP_MS,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: DOWN_MS,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.delay(REST_MS),
        ])
      )
    );

    const timers = loops.map((loop, i) =>
      setTimeout(() => loop.start(), i * STAGGER_MS)
    );

    return () => {
      timers.forEach(clearTimeout);
      loops.forEach((loop) => loop.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <Animated.Image
        source={logoSource}
        resizeMode="contain"
        style={[
          styles.logo,
          { opacity: logoOpacity, transform: [{ scale: logoScale }] },
        ]}
      />

      <View style={styles.dotsRow}>
        {dots.map((dot, i) => (
          <Animated.View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor: dotColor,
                opacity: dot.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.4, 1],
                }),
                transform: [
                  {
                    translateY: dot.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -DOT_TRAVEL],
                    }),
                  },
                ],
              },
            ]}
          />
        ))}
      </View>

      <Text style={[styles.text, { color: textColor }]}>{text}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  logo: {
    width: 140,
    height: 140,
    marginBottom: 28,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: DOT_TRAVEL + 12,
    marginBottom: 18,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    marginHorizontal: 5,
  },
  text: {
    fontSize: 16,
    fontFamily: fonts.medium,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
});
