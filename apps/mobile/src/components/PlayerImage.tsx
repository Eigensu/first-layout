import { View, Text, Image } from 'react-native';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '../theme';

interface PlayerImageProps {
  imageUrl?: string | null;
  playerName?: string;
  size?: number;
  fallbackIcon?: keyof typeof Ionicons.glyphMap;
}

// Component for player image with fallback
export function PlayerImage({ 
  imageUrl, 
  playerName, 
  size = 40, 
  fallbackIcon = 'person' 
}: PlayerImageProps) {
  const { theme } = useThemeContext();
  const [imageError, setImageError] = useState(false);

  if (!imageUrl || imageError) {
    return (
      <View style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: theme.accent.pink.primary,
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        {playerName ? (
          <Text style={{
            fontSize: size * 0.4,
            fontWeight: 'bold',
            // text.button is the palette's on-accent colour — plain white is
            // unreadable on the dark theme's pale lavender accent.
            color: theme.text.button
          }}>
            {playerName.charAt(0).toUpperCase()}
          </Text>
        ) : (
          <Ionicons name={fallbackIcon} size={size * 0.5} color={theme.text.button} />
        )}
      </View>
    );
  }

  return (
    <Image
      source={{ uri: imageUrl }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: theme.bg.elevated
      }}
      onError={() => setImageError(true)}
    />
  );
}