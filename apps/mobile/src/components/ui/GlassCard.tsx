import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeContext } from '../../theme';

interface GlassCardProps {
  children: React.ReactNode;
  /** Outer layout style (margins, width, etc.) */
  style?: StyleProp<ViewStyle>;
  /** Inner padding around content */
  padding?: number;
  /** Blur strength */
  intensity?: number;
  /** Corner radius */
  radius?: number;
}

/**
 * Frosted "liquid glass" surface. Renders a real background blur (expo-blur)
 * with a translucent tint, a diagonal light sheen, and a hairline border.
 * Designed to sit over a gradient background so the blur has something to frost.
 */
export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  style,
  padding = 16,
  intensity = 28,
  radius = 22,
}) => {
  const { isDark } = useThemeContext();

  return (
    <View
      style={[
        {
          borderRadius: radius,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: isDark
            ? 'rgba(255,255,255,0.14)'
            : 'rgba(255,255,255,0.55)',
        },
        style,
      ]}
    >
      <BlurView
        intensity={intensity}
        tint={isDark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      {/* Translucent tint so content stays legible over busy backgrounds */}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: isDark
              ? 'rgba(38,16,78,0.42)'
              : 'rgba(255,255,255,0.40)',
          },
        ]}
      />
      {/* Diagonal sheen for the "liquid" highlight */}
      <LinearGradient
        colors={
          isDark
            ? ['rgba(255,255,255,0.12)', 'rgba(255,255,255,0)']
            : ['rgba(255,255,255,0.65)', 'rgba(255,255,255,0)']
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0.9 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={{ padding }}>{children}</View>
    </View>
  );
};
