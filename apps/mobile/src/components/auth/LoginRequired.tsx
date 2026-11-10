import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useThemeContext } from '../../theme';
import { GlassScreen } from '../ui/GlassScreen';
import { SurfaceCard } from '../ui/SurfaceCard';
import { GlassButton } from '../ui/GlassButton';

interface LoginRequiredProps {
  title?: string;
  message: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

/**
 * Full-screen prompt shown on auth-only tabs (My Teams, Profile) when a guest
 * reaches them. Keeps the app browsable while making the login step obvious.
 */
export const LoginRequired: React.FC<LoginRequiredProps> = ({
  title = 'Login required',
  message,
  icon = 'lock-closed-outline',
}) => {
  const { theme } = useThemeContext();
  const router = useRouter();

  return (
    <GlassScreen>
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <SurfaceCard padding={28} style={{ width: '100%', maxWidth: 380 }}>
          <View style={{ alignItems: 'center' }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 20,
                backgroundColor: theme.accent.pink.primary + '22',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
              }}
            >
              <Ionicons name={icon} size={32} color={theme.accent.pink.primary} />
            </View>
            <Text
              style={{
                fontSize: 20,
                fontFamily: theme.fonts.bold,
                color: theme.text.main,
                marginBottom: 8,
                textAlign: 'center',
              }}
            >
              {title}
            </Text>
            <Text
              style={{
                fontSize: 16,
                color: theme.text.muted,
                textAlign: 'center',
                marginBottom: 24,
                lineHeight: 21,
              }}
            >
              {message}
            </Text>
            <GlassButton
              title="Login"
              onPress={() => router.push('/(auth)/login')}
              size="lg"
            />
          </View>
        </SurfaceCard>
      </View>
    </GlassScreen>
  );
};
