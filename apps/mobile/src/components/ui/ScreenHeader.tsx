import React from 'react';
import { View, Text, ViewStyle, StyleSheet, LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { useThemeContext } from '../../theme';

/**
 * The shared header surface: a frosted-glass band, floating above the
 * screen's scrollable content (which runs underneath it, full-bleed to the
 * top) so the blur actually has something to show through — same glass
 * treatment, and the same reason it works, as the floating tab bar.
 *
 * It paints its own status-bar inset rather than sitting inside a top safe
 * area. Screens using it must drop the 'top' edge from their SafeAreaView
 * (`<GlassScreen edges={[]}>`), let their ScrollView/FlatList fill the full
 * screen (not stacked after the header in flow), and pad that scroll
 * content's top by the header's measured height via `onHeightChange`.
 */
export const useHeaderInnerStyle = (): ViewStyle => {
  const insets = useSafeAreaInsets();
  return {
    paddingTop: insets.top + 6,
    paddingHorizontal: 16,
    paddingBottom: 12,
  };
};

interface HeaderSurfaceProps {
  children: React.ReactNode;
  style?: ViewStyle;
  /** Reports the header's rendered height so the screen underneath can pad
   *  its scroll content by that much. */
  onHeightChange?: (height: number) => void;
}

export const HeaderSurface: React.FC<HeaderSurfaceProps> = ({
  children,
  style,
  onHeightChange,
}) => {
  const { theme, isDark } = useThemeContext();
  const innerStyle = useHeaderInnerStyle();

  const handleLayout = (e: LayoutChangeEvent) => {
    onHeightChange?.(e.nativeEvent.layout.height);
  };

  return (
    <View
      onLayout={onHeightChange ? handleLayout : undefined}
      style={[
        {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 20,
        },
        style,
      ]}
    >
      <View
        style={{
          borderBottomLeftRadius: 28,
          borderBottomRightRadius: 28,
          overflow: 'hidden',
        }}
      >
        <BlurView
          intensity={isDark ? 50 : 45}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: isDark ? theme.bg.card + 'CC' : 'rgba(255,255,255,0.62)',
            },
          ]}
        />
        <View style={innerStyle}>{children}</View>
      </View>
    </View>
  );
};

interface ScreenHeaderProps {
  title: string;
  /** Optional extra row under the title, e.g. filter chips. */
  children?: React.ReactNode;
  onHeightChange?: (height: number) => void;
}

export const ScreenHeader: React.FC<ScreenHeaderProps> = ({
  title,
  children,
  onHeightChange,
}) => {
  const { theme } = useThemeContext();

  return (
    <HeaderSurface onHeightChange={onHeightChange}>
      <Text
        style={{
          fontSize: 26,
          fontFamily: theme.fonts.bold,
          color: theme.text.main,
          marginBottom: children ? 12 : 0,
        }}
      >
        {title}
      </Text>
      {children}
    </HeaderSurface>
  );
};
