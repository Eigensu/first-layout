import React from 'react';
import { View } from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeContext } from '../../theme';

interface GlassScreenProps {
  children: React.ReactNode;
  edges?: Edge[];
}

/**
 * Shared screen scaffold: the near-flat app background with a transparent
 * SafeAreaView on top. Content sits on plain <SurfaceCard>s over this; the
 * saturated hero wash is reserved for the landing.
 */
export const GlassScreen: React.FC<GlassScreenProps> = ({
  children,
  edges = ['top'],
}) => {
  const { theme } = useThemeContext();

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg.body }}>
      <LinearGradient
        colors={theme.gradient.screen as [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      {/* SafeAreaView's types resolve against a hoisted @types/react from the
          workspace's other (React 18) app, so its ReactNode is structurally
          narrower than this file's — a version-skew false positive, not a
          real mismatch. */}
      <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }} edges={edges}>
        {children as any}
      </SafeAreaView>
    </View>
  );
};
