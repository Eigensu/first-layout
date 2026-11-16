import React from 'react';
import { View, Text } from 'react-native';
import { useThemeContext } from '../../theme';

interface TopBannerProps {
  title: string;
}

export function TopBanner({ title }: TopBannerProps) {
  const { theme } = useThemeContext();

  return (
    <View
      style={{
        backgroundColor: theme.bg.elevated,
        paddingHorizontal: 24,
        paddingTop: 20,
        paddingBottom: 16,
      }}
    >
      <Text style={{
        fontSize: 28,
        fontWeight: 'bold',
        color: theme.text.main,
      }}>
        {title}
      </Text>
    </View>
  );
}