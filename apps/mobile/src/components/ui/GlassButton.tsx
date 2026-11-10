import React from 'react';
import {
  Pressable,
  Text,
  View,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  PressableProps,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '../../theme';

export type GlassButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger';
export type GlassButtonSize = 'sm' | 'md' | 'lg';

interface SizeConfig {
  paddingVertical: number;
  paddingHorizontal: number;
  fontSize: number;
  borderRadius: number;
  iconSize: number;
  gap: number;
}

const SIZES: Record<GlassButtonSize, SizeConfig> = {
  sm: { paddingVertical: 8, paddingHorizontal: 14, fontSize: 12, borderRadius: 14, iconSize: 14, gap: 5 },
  md: { paddingVertical: 12, paddingHorizontal: 20, fontSize: 14, borderRadius: 16, iconSize: 16, gap: 6 },
  lg: { paddingVertical: 16, paddingHorizontal: 24, fontSize: 16, borderRadius: 18, iconSize: 18, gap: 8 },
};

export interface GlassButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  title?: string;
  children?: React.ReactNode;
  variant?: GlassButtonVariant;
  size?: GlassButtonSize;
  icon?: keyof typeof Ionicons.glyphMap;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  loading?: boolean;
  disabled?: boolean;
  /** Overrides the size preset's corner radius, e.g. to line up with a
   *  sibling pill (like a status badge) that isn't a GlassButton. Only
   *  changing `cfg.borderRadius` via `style` doesn't work: the outer
   *  Pressable would clip to the new radius but the inner tint layer is a
   *  separate view hard-coded to the size preset's radius, so the tint's
   *  square-ish corners would poke out from under the new clip. */
  radius?: number;
  /** Overrides the variant's default tint/overlay color, e.g. for a
   *  semantic accent (orange for "vice captain") that doesn't fit the
   *  standard primary/secondary/danger palette. */
  tintColor?: string;
  /** Overrides the variant's default text/icon color, paired with tintColor. */
  contentColor?: string;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

/**
 * The shared glass-morphism button: a frosted BlurView pill tinted by
 * variant, matching the tab bar highlight and header treatment. Every
 * variant blurs, so even the primary CTA reads as part of the same glass
 * material as the rest of the chrome rather than a flat, opaque block.
 */
export const GlassButton: React.FC<GlassButtonProps> = ({
  title,
  children,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'right',
  fullWidth = false,
  loading = false,
  disabled = false,
  tintColor,
  contentColor,
  radius,
  style,
  textStyle,
  onPress,
  ...pressableProps
}) => {
  const { theme, isDark } = useThemeContext();
  const cfg = SIZES[size];
  const borderRadius = radius ?? cfg.borderRadius;
  const isDisabled = disabled || loading;

  const overlayColor =
    tintColor ??
    (variant === 'primary'
      ? theme.accent.pink.primary + (isDark ? 'E6' : 'F0')
      : variant === 'secondary'
        ? isDark
          ? 'rgba(255,255,255,0.16)'
          : 'rgba(180,95,191,0.14)'
        : variant === 'danger'
          ? theme.status.danger + (isDark ? '26' : '1A')
          : 'transparent');

  const textColor =
    contentColor ??
    (variant === 'primary'
      ? theme.text.button
      : variant === 'secondary'
        ? theme.text.main
        : variant === 'danger'
          ? theme.status.danger
          : theme.accent.pink.primary);

  const borderStyle: ViewStyle =
    variant === 'outline'
      ? { borderWidth: 1.5, borderColor: theme.accent.pink.primary + (isDark ? '80' : '60') }
      : variant === 'danger'
        ? { borderWidth: 1.5, borderColor: theme.status.danger + (isDark ? '80' : '60') }
        : {};

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        {
          borderRadius,
          overflow: 'hidden',
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
          alignSelf: fullWidth ? undefined : 'flex-start',
          width: fullWidth ? '100%' : undefined,
          // No-op when the box's height comes from padding (the normal
          // case), but keeps content centered when a caller pins an exact
          // height via `style` to match a sibling that isn't a GlassButton.
          justifyContent: 'center',
        },
        style,
      ]}
      {...pressableProps}
    >
      {variant !== 'outline' && (
        <BlurView
          intensity={isDark ? 40 : 30}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
      )}
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: overlayColor },
          borderStyle,
          { borderRadius },
        ]}
      />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: cfg.paddingVertical,
          paddingHorizontal: cfg.paddingHorizontal,
        }}
      >
        {loading ? (
          <ActivityIndicator size="small" color={textColor} />
        ) : (
          <>
            {icon && iconPosition === 'left' && (
              <Ionicons
                name={icon}
                size={cfg.iconSize}
                color={textColor}
                style={{ marginRight: cfg.gap }}
              />
            )}
            {children ?? (
              <Text
                style={[
                  {
                    color: textColor,
                    fontFamily: theme.fonts.semiBold,
                    fontSize: cfg.fontSize,
                  },
                  textStyle,
                ]}
                numberOfLines={1}
              >
                {title}
              </Text>
            )}
            {icon && iconPosition === 'right' && (
              <Ionicons
                name={icon}
                size={cfg.iconSize}
                color={textColor}
                style={{ marginLeft: cfg.gap }}
              />
            )}
          </>
        )}
      </View>
    </Pressable>
  );
};
