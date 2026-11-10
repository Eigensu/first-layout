import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Animated,
  StyleSheet,
  LayoutChangeEvent,
  PanResponder,
} from 'react-native';
import { BlurView } from 'expo-blur';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useThemeContext } from '../../theme';
import { useAuthStore } from '../../core/store/authStore';
import { useUserProfile } from '../../core/hooks/useUser';

type TabRoute = BottomTabBarProps['state']['routes'][number];

// Tabs hidden from guests (mirrors the auth gating on those screens).
const GUEST_HIDDEN = ['contests', 'my-teams'];

const MARGIN = 16; // horizontal gap to the screen edge
const FLOAT_GAP = 22; // fixed padding above the very bottom edge (ignores safe-area inset)
const BAR_HEIGHT = 64;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * Floating "liquid glass" tab bar (Apple/WhatsApp-style): a frosted pill
 * fixed to the bottom of the screen, with a sliding glass highlight under
 * the active tab. Tapping any tab switches to it immediately as usual — but
 * you can also grab the highlight itself and drag it over to a different
 * tab to switch, releasing ("dropping" it) on the option you want.
 *
 * Owns tab visibility itself (auth + admin) so it stays correct without
 * relying on expo-router's href filtering.
 */
export function GlassTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { theme, isDark } = useThemeContext();
  const { isAuthenticated } = useAuthStore();
  const { data: userProfile } = useUserProfile();

  const routes = state.routes.filter((route: TabRoute) => {
    if (route.name === 'admin') return !!userProfile?.isAdmin;
    if (!isAuthenticated && GUEST_HIDDEN.includes(route.name)) return false;
    return true;
  });

  const focusedKey = state.routes[state.index]?.key;
  const activeIndex = routes.findIndex((r: TabRoute) => r.key === focusedKey);

  const [rowWidth, setRowWidth] = useState(0);
  const count = routes.length;
  const itemWidth = count > 0 ? rowWidth / count : 0;
  const highlightX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (itemWidth > 0 && activeIndex >= 0) {
      Animated.spring(highlightX, {
        toValue: activeIndex * itemWidth,
        useNativeDriver: false,
        tension: 70,
        friction: 12,
      }).start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, itemWidth]);

  const navigateToRoute = (route: TabRoute, isFocused: boolean) => {
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(route.name);
    }
  };

  // --- Drag the selector between tabs ---------------------------------
  // The bar itself stays fixed to the bottom; only the highlight capsule
  // can be picked up and slid over to another tab to switch to it.
  const dragStartX = useRef(0);

  const selectorPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => itemWidth > 0,
      onPanResponderGrant: () => {
        dragStartX.current = activeIndex * itemWidth;
        highlightX.setOffset(dragStartX.current);
        highlightX.setValue(0);
      },
      onPanResponderMove: Animated.event([null, { dx: highlightX }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_evt, gesture) => {
        highlightX.flattenOffset();
        if (itemWidth <= 0) return;

        const droppedX = clamp(dragStartX.current + gesture.dx, 0, itemWidth * (count - 1));
        const nearestIndex = clamp(Math.round(droppedX / itemWidth), 0, count - 1);

        Animated.spring(highlightX, {
          toValue: nearestIndex * itemWidth,
          useNativeDriver: false,
          tension: 70,
          friction: 12,
        }).start();

        if (nearestIndex !== activeIndex) {
          navigateToRoute(routes[nearestIndex], false);
        }
      },
      onPanResponderTerminate: () => {
        highlightX.flattenOffset();
        Animated.spring(highlightX, {
          toValue: activeIndex * itemWidth,
          useNativeDriver: false,
          tension: 70,
          friction: 12,
        }).start();
      },
    }),
  ).current;

  return (
    <View
      style={{
        position: 'absolute',
        left: MARGIN,
        right: MARGIN,
        bottom: FLOAT_GAP,
        height: BAR_HEIGHT,
        borderRadius: BAR_HEIGHT / 2,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.6)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.22,
        shadowRadius: 14,
        elevation: 8,
      }}
    >
      <BlurView
        intensity={55}
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
      <View
        style={{ flex: 1, flexDirection: 'row' }}
        onLayout={(e: LayoutChangeEvent) => setRowWidth(e.nativeEvent.layout.width)}
      >
        {/* Sliding highlight. It hugs the full cell (minus a hairline gap) so
            the widest label — "My Teams" — sits inside it rather than
            spilling out either side. Rendered behind the tab row (no
            zIndex) so its glass blur only samples the bar's background,
            not the icon/label sitting on top of it. */}
        {itemWidth > 0 && activeIndex >= 0 && (
          <Animated.View
            style={{
              position: 'absolute',
              top: 6,
              bottom: 6,
              left: 3,
              width: itemWidth - 6,
              borderRadius: (BAR_HEIGHT - 12) / 2,
              overflow: 'hidden',
              transform: [{ translateX: highlightX }],
            }}
          >
            <BlurView
              intensity={isDark ? 40 : 30}
              tint={isDark ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: isDark
                    ? 'rgba(255,255,255,0.16)'
                    : 'rgba(180,95,191,0.14)',
                },
              ]}
            />
          </Animated.View>
        )}

        {routes.map((route: TabRoute) => {
          const { options } = descriptors[route.key];
          const isFocused = route.key === focusedKey;
          const color = isFocused
            ? theme.accent.pink.primary
            : isDark
              ? theme.text.subtle
              : theme.text.muted;
          const label = options.title ?? route.name;
          const icon = options.tabBarIcon
            ? options.tabBarIcon({ focused: isFocused, color, size: 22 })
            : null;

          return (
            <Pressable
              key={route.key}
              onPress={() => navigateToRoute(route, isFocused)}
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 2,
              }}
            >
              {icon}
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 11,
                  fontWeight: '600',
                  color,
                  marginTop: 3,
                }}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}

        {/* Invisible drag handle, same geometry as the highlight above but
            layered on top so it can capture the "grab and slide" gesture
            without the highlight itself having to sit in front of (and
            blur) the active tab's icon/label. */}
        {itemWidth > 0 && activeIndex >= 0 && (
          <Animated.View
            {...selectorPanResponder.panHandlers}
            style={{
              position: 'absolute',
              top: 6,
              bottom: 6,
              left: 3,
              width: itemWidth - 6,
              transform: [{ translateX: highlightX }],
              zIndex: 5,
            }}
          />
        )}
      </View>
    </View>
  );
}
