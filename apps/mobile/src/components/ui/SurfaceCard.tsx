import React from 'react';
import { View, ViewStyle, StyleProp } from 'react-native';
import { useThemeContext } from '../../theme';

interface SurfaceCardProps {
  children: React.ReactNode;
  /** Outer layout style (margins, width, etc.) */
  style?: StyleProp<ViewStyle>;
  /** Inner padding around content */
  padding?: number;
  /** Corner radius */
  radius?: number;
}

/**
 * Plain, opaque content surface — the calm counterpart to <GlassCard>.
 *
 * Frosted glass is reserved for chrome that floats over content (the tab bar,
 * the news carousel, header pills). Everything you actually read — contest
 * rows, team cards, profile sections — sits on this instead, so the app reads
 * as solid panels on a quiet background rather than glass on glass.
 */
export const SurfaceCard: React.FC<SurfaceCardProps> = ({
  children,
  style,
  padding = 16,
  radius = 18,
}) => {
  const { theme, isDark } = useThemeContext();

  return (
    <View
      style={[
        {
          backgroundColor: isDark ? theme.bg.elevated : theme.bg.card,
          borderRadius: radius,
          borderWidth: 1,
          borderColor: theme.border.subtle,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <View style={{ padding }}>{children}</View>
    </View>
  );
};
