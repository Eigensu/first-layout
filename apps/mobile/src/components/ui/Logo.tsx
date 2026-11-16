import React from 'react';
import { Image, ImageStyle } from 'react-native';
import { useThemeContext } from '../../theme';

interface LogoProps {
  size?: number;
  style?: ImageStyle;
}

export function Logo({ size = 40, style }: LogoProps) {
  const { isDark } = useThemeContext();
  
  // Choose logo based on theme
  // Dark mode: use dark logo (logo-dark.png) 
  // Light mode: use light logo (logo-light.png)
  const logoSource = isDark 
    ? require('../../../assets/logo-dark.png')
    : require('../../../assets/logo-light.png');
  
  return (
    <Image
      source={logoSource}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
        style,
      ]}
    />
  );
}