import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useThemeContext } from '../../theme';
import { useTournamentStore } from '../../core/store/tournamentStore';
import { useTournamentSwitch } from '../../core/hooks/useTournamentSwitch';
import { tournamentService } from '../../services/tournamentService';
import { Tournament } from '../../types/tournament';

const STATUS_ORDER: Record<string, number> = {
  LIVE: 0,
  UPCOMING: 1,
  COMPLETED: 2,
};

interface TournamentPickerModalProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * Bottom-sheet tournament picker shared by the landing header (guests), the
 * profile switcher and the login screen. Selection always goes through
 * useTournamentSwitch, which keeps the session and drops cached data.
 */
export const TournamentPickerModal: React.FC<TournamentPickerModalProps> = ({
  visible,
  onClose,
}) => {
  const { theme } = useThemeContext();
  const { tournaments, selectedTournament, setTournaments } = useTournamentStore();
  const { switchTournament } = useTournamentSwitch();

  // The picker also opens on screens that never load the directory (login),
  // so fetch it here when the store has nothing cached.
  const { data: fetchedTournaments } = useQuery({
    queryKey: ['tournaments'],
    queryFn: () => tournamentService.getTournaments(),
    enabled: visible && tournaments.length === 0,
  });

  useEffect(() => {
    if (fetchedTournaments?.length) setTournaments(fetchedTournaments);
  }, [fetchedTournaments, setTournaments]);

  const statusColor = (status: Tournament['status']) => {
    switch (status) {
      case 'LIVE':
        return theme.status.success;
      case 'UPCOMING':
        return theme.accent.pink.primary;
      default:
        return theme.text.subtle;
    }
  };

  const sorted = [...tournaments].sort(
    (a, b) => (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3)
  );

  const handleSelect = (tournament: Tournament) => {
    onClose();
    // Let the sheet finish dismissing first: a confirmation alert raised while
    // it is still up would be presented behind it on iOS.
    setTimeout(() => switchTournament(tournament), 350);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: theme.bg.body,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingTop: 12,
            paddingBottom: 32,
            maxHeight: '75%',
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: theme.border.strong,
              marginBottom: 12,
            }}
          />
          <Text
            style={{
              fontSize: 20,
              fontFamily: theme.fonts.bold,
              color: theme.text.main,
              paddingHorizontal: 20,
              marginBottom: 12,
            }}
          >
            Choose a Tournament
          </Text>

          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}
            showsVerticalScrollIndicator={false}
          >
            {sorted.length === 0 && (
              <Text
                style={{
                  color: theme.text.subtle,
                  textAlign: 'center',
                  paddingVertical: 32,
                }}
              >
                No tournaments available right now.
              </Text>
            )}

            {sorted.map((tournament) => {
              const isSelected = selectedTournament?.id === tournament.id;
              return (
                <TouchableOpacity
                  key={tournament.id}
                  onPress={() => handleSelect(tournament)}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: theme.bg.card,
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 12,
                    borderWidth: 1,
                    borderColor: isSelected
                      ? theme.accent.pink.primary
                      : theme.border.subtle,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 16,
                        fontFamily: theme.fonts.semiBold,
                        color: theme.text.main,
                        marginBottom: 2,
                      }}
                    >
                      {tournament.title}
                    </Text>
                    <Text style={{ fontSize: 13, color: theme.text.subtle }}>
                      {tournament.game_name?.toUpperCase()}
                    </Text>
                  </View>

                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: statusColor(tournament.status) + '20',
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 12,
                      marginLeft: 10,
                    }}
                  >
                    <View
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: statusColor(tournament.status),
                        marginRight: 6,
                      }}
                    />
                    <Text
                      style={{
                        fontSize: 12,
                        fontFamily: theme.fonts.semiBold,
                        color: statusColor(tournament.status),
                      }}
                    >
                      {tournament.status_display || tournament.status}
                    </Text>
                  </View>

                  {isSelected && (
                    <Ionicons
                      name="checkmark-circle"
                      size={20}
                      color={theme.accent.pink.primary}
                      style={{ marginLeft: 8 }}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
};
