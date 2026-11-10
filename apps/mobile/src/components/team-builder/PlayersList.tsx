import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PlayerCard } from '../../features/arena/molecules/PlayerCard';
import { useThemeContext } from '../../theme';
import { Player } from '../../types/arena';
import { GlassButton } from '../ui/GlassButton';

interface PlayersListProps {
  players: Player[];
  selectedPlayerIds: Set<string>;
  captainId?: string;
  viceCaptainId?: string;
  onTogglePlayer: (player: Player) => void;
  onSetCaptain?: (playerId: string) => void;
  onSetViceCaptain?: (playerId: string) => void;
  showCaptainOptions?: boolean;
  emptyStateMessage?: string;
  searchQuery?: string;
  onClearSearch?: () => void;
  /** Locks every card that isn't already picked (slot is full). Picked
   *  cards stay tappable so the user can still swap someone out. */
  disableUnselected?: boolean;
  showSelectionIndicator?: boolean;
}

export const PlayersList: React.FC<PlayersListProps> = ({
  players,
  selectedPlayerIds,
  captainId,
  viceCaptainId,
  onTogglePlayer,
  onSetCaptain,
  onSetViceCaptain,
  showCaptainOptions = true,
  emptyStateMessage = "No players available",
  searchQuery,
  onClearSearch,
  disableUnselected = false,
  showSelectionIndicator = true,
}) => {
  const { theme } = useThemeContext();

  if (players.length === 0) {
    return (
      <View style={{
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 40,
        backgroundColor: theme.bg.card,
        borderRadius: 16,
        marginTop: 8
      }}>
        <Ionicons 
          name={searchQuery ? "search-outline" : "people-outline"} 
          size={48} 
          color={theme.text.subtle} 
        />
        <Text style={{
          color: theme.text.muted,
          fontSize: 16,
          marginTop: 12,
          textAlign: 'center'
        }}>
          {emptyStateMessage}
        </Text>
        {searchQuery && onClearSearch && (
          <GlassButton
            title="Clear Search"
            onPress={onClearSearch}
            size="sm"
            style={{ marginTop: 12 }}
          />
        )}
      </View>
    );
  }

  return (
    <View style={{
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      gap: 4
    }}>
      {players.map((player) => {
        const isSelected = selectedPlayerIds.has(player.id);
        return (
        <PlayerCard
          key={player.id}
          player={player}
          isSelected={isSelected}
          disabled={disableUnselected && !isSelected}
          showSelectionIndicator={showSelectionIndicator}
          isCaptain={captainId === player.id}
          isViceCaptain={viceCaptainId === player.id}
          onToggle={() => onTogglePlayer(player)}
          onSetCaptain={onSetCaptain ? () => onSetCaptain(player.id) : undefined}
          onSetViceCaptain={onSetViceCaptain ? () => onSetViceCaptain(player.id) : undefined}
          compact={true}
          showCaptainOptions={showCaptainOptions}
        />
        );
      })}
    </View>
  );
};