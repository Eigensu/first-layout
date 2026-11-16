import React from 'react';
import { View, Text, ScrollView, Pressable, Modal, ActivityIndicator } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '../theme';
import { arenaService } from '../services/arenaService';
import { arenaKeys } from '../features/arena/queryKeys';
import { formatPoints } from '../utils/points';

interface TeamDetailsModalProps {
  visible: boolean;
  contestId: string | null;
  teamId: string | null;
  onClose: () => void;
}

export const TeamDetailsModal: React.FC<TeamDetailsModalProps> = ({
  visible,
  contestId,
  teamId,
  onClose,
}) => {
  const { theme } = useThemeContext();

  // Fetch team details when modal is opened
  const { data: teamDetails, isLoading: teamLoading } = useQuery({
    queryKey: arenaKeys.contestTeam(contestId, teamId),
    queryFn: () => arenaService.getContestTeam(contestId!, teamId!),
    enabled: !!contestId && !!teamId && visible,
  });

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
      statusBarTranslucent={false}
    >
      <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg.body }} edges={['top', 'bottom']}>
        {/* Modal Header */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 12,
          backgroundColor: theme.bg.body,
          borderBottomWidth: 1,
          borderBottomColor: theme.border.subtle,
        }}>
          <Text style={{
            fontSize: 18,
            fontWeight: 'bold',
            color: theme.text.main,
          }}>
            Team Details
          </Text>
          <Pressable
            onPress={onClose}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: theme.bg.card,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="close" size={20} color={theme.text.main} />
          </Pressable>
        </View>

        {/* Modal Content */}
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 20 }}
        >
            {teamLoading ? (
              <View style={{
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 40,
              }}>
                <ActivityIndicator size="large" color={theme.accent.pink.primary} />
                <Text style={{
                  fontSize: 14,
                  color: theme.text.subtle,
                  marginTop: 12,
                }}>
                  Loading team details...
                </Text>
              </View>
            ) : teamDetails ? (
              <View style={{ padding: 16 }}>
                {/* Team Header */}
                <View style={{
                  backgroundColor: theme.bg.card,
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 16,
                  borderWidth: 1,
                  borderColor: theme.border.subtle,
                }}>
                  <Text style={{
                    fontSize: 16,
                    fontWeight: 'bold',
                    color: theme.text.main,
                    marginBottom: 8,
                  }}>
                    {teamDetails.team_name}
                  </Text>
                  <View style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                  }}>
                    <View>
                      <Text style={{
                        fontSize: 12,
                        color: theme.text.subtle,
                        marginBottom: 4,
                      }}>
                        Contest Points
                      </Text>
                      <Text style={{
                        fontSize: 20,
                        fontWeight: 'bold',
                        color: theme.accent.pink.primary,
                      }}>
                        {formatPoints(teamDetails.contest_points).toLocaleString()}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{
                        fontSize: 12,
                        color: theme.text.subtle,
                        marginBottom: 4,
                      }}>
                        Base Points
                      </Text>
                      <Text style={{
                        fontSize: 20,
                        fontWeight: 'bold',
                        color: theme.text.main,
                      }}>
                        {formatPoints(teamDetails.base_points).toLocaleString()}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Players List */}
                <Text style={{
                  fontSize: 14,
                  fontWeight: '600',
                  color: theme.text.main,
                  marginBottom: 12,
                }}>
                  Players ({teamDetails.players.length})
                </Text>

                {/* Group players by slot */}
                {(() => {
                  const grouped: Record<string, typeof teamDetails.players> = {};
                  teamDetails.players.forEach(player => {
                    const slot = player.slot || 'Unknown';
                    if (!grouped[slot]) grouped[slot] = [];
                    grouped[slot].push(player);
                  });

                  return Object.entries(grouped).map(([slot, players]) => (
                    <View key={slot} style={{ marginBottom: 16 }}>
                      <Text style={{
                        fontSize: 12,
                        fontWeight: '600',
                        color: theme.text.subtle,
                        marginBottom: 8,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}>
                        {slot}
                      </Text>
                      <View style={{
                        backgroundColor: theme.bg.card,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: theme.border.subtle,
                        overflow: 'hidden',
                      }}>
                        {players.map((player, idx) => (
                          <View
                            key={player.id}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              paddingVertical: 10,
                              paddingHorizontal: 12,
                              borderBottomWidth: idx < players.length - 1 ? 0.5 : 0,
                              borderBottomColor: theme.border.subtle + '40',
                            }}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={{
                                fontSize: 14,
                                fontWeight: '600',
                                color: theme.text.main,
                                marginBottom: 2,
                              }}>
                                {player.name}
                              </Text>
                              {player.team && (
                                <Text style={{
                                  fontSize: 12,
                                  color: theme.text.subtle,
                                }}>
                                  {player.team}
                                </Text>
                              )}
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                              <Text style={{
                                fontSize: 14,
                                fontWeight: 'bold',
                                color: theme.accent.pink.primary,
                              }}>
                                {formatPoints(player.contest_points).toLocaleString()}
                              </Text>
                              <Text style={{
                                fontSize: 12,
                                color: theme.text.subtle,
                              }}>
                                pts
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    </View>
                  ));
                })()}
              </View>
            ) : (
              <View style={{
                alignItems: 'center',
                paddingVertical: 40,
              }}>
                <Ionicons name="alert-circle-outline" size={40} color={theme.text.subtle} />
                <Text style={{
                  fontSize: 14,
                  color: theme.text.subtle,
                  marginTop: 12,
                  textAlign: 'center',
                }}>
                  Failed to load team details
                </Text>
              </View>
            )}
          </ScrollView>
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
};
