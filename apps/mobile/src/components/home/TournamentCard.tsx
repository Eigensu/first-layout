import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '../../theme';
import { SurfaceCard } from '../ui/SurfaceCard';
import { Tournament } from '../../types/tournament';

interface TournamentCardProps {
  tournament: Tournament;
  selected?: boolean;
  onPress: () => void;
}

export const TournamentCard: React.FC<TournamentCardProps> = ({
  tournament,
  selected = false,
  onPress,
}) => {
  const { theme } = useThemeContext();

  const statusColor = (() => {
    switch (tournament.status) {
      case 'LIVE':
        return theme.status.success;
      case 'UPCOMING':
        return theme.accent.pink.primary;
      default:
        return theme.text.subtle;
    }
  })();

  return (
    <Pressable onPress={onPress} style={{ marginBottom: 12 }}>
      <SurfaceCard
        style={
          selected
            ? { borderColor: theme.accent.pink.primary, borderWidth: 1.5 }
            : undefined
        }
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              backgroundColor: theme.accent.pink.primary + '22',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 12,
            }}
          >
            <Ionicons name="trophy" size={22} color={theme.accent.pink.primary} />
          </View>

          <View style={{ flex: 1 }}>
            <Text
              numberOfLines={1}
              style={{
                fontSize: 16,
                fontFamily: theme.fonts.semiBold,
                color: theme.text.main,
                marginBottom: 2,
              }}
            >
              {tournament.title}
            </Text>
            <Text style={{ fontSize: 12, color: theme.text.subtle }}>
              {tournament.game_name?.toUpperCase()}
            </Text>
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: statusColor + '20',
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 12,
              marginLeft: 8,
            }}
          >
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: statusColor,
                marginRight: 6,
              }}
            />
            <Text
              style={{
                fontSize: 12,
                fontFamily: theme.fonts.semiBold,
                color: statusColor,
              }}
            >
              {tournament.status_display || tournament.status}
            </Text>
          </View>

          {selected && (
            <Ionicons
              name="checkmark-circle"
              size={20}
              color={theme.accent.pink.primary}
              style={{ marginLeft: 6 }}
            />
          )}
        </View>
      </SurfaceCard>
    </Pressable>
  );
};
