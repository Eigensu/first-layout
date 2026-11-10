import React, { useEffect, useRef } from 'react';
import { Animated, DimensionValue, Easing, ViewStyle, StyleProp } from 'react-native';
import { useThemeContext } from '../../theme';

interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Pulsing placeholder bar for content that is still loading.
 *
 * Shows the *shape* of what's coming instead of an empty state, which on a
 * cold start otherwise reads as "there's nothing here" a moment before the
 * data lands.
 */
export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = 12,
  radius = 6,
  style,
}) => {
  const { theme } = useThemeContext();
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: theme.bg.chip,
          opacity: pulse,
        },
        style,
      ]}
    />
  );
};
