import React from 'react';
import { View, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { useThemeContext } from '../../theme';

/**
 * Frosted background for the floating tab bar. The tab bar container clips this
 * to its rounded shape, so we only need the blur + a translucent tint that
 * keeps the icons/labels legible over a busy backdrop.
 */
export const GlassTabBarBackground: React.FC = () => {
  const { isDark } = useThemeContext();
  return (
    <View style={StyleSheet.absoluteFill}>
      <BlurView
        intensity={40}
        tint={isDark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: isDark
              ? 'rgba(38,16,78,0.55)'
              : 'rgba(255,255,255,0.5)',
          },
        ]}
      />
    </View>
  );
};
