import { View, Text, ScrollView, Pressable, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Player } from '../../types/arena';
import { PlayerImage } from '../PlayerImage';
import { formatPoints } from '../../utils/points';
import { GlassButton } from '../ui/GlassButton';

// Player Detail Modal Component
export function PlayerDetailModal({ 
  player, 
  team, 
  contest,
  slots,
  visible, 
  onClose, 
  theme,
  onMakeCaptain,
  onMakeViceCaptain,
  onReplacePlayer,
  canEdit,
  lockedReason,
}: {
  player: Player | null;
  team: any;
  contest: any;
  slots: any[];
  visible: boolean;
  onClose: () => void;
  theme: any;
  onMakeCaptain: (playerId: string) => void;
  onMakeViceCaptain: (playerId: string) => void;
  onReplacePlayer: (playerId: string) => void;
  /** Whether the team can still be changed (see canEditTeamInContest). */
  canEdit: boolean;
  /** Shown in place of the actions when canEdit is false. */
  lockedReason: string;
}) {
  if (!player) return null;

  // Status badge colour only. Whether the team can be edited is `canEdit`.
  const isContestLive = contest?.status === 'live' || contest?.status === 'ongoing';
  const isCaptain = player.id === team?.captain_id;
  const isViceCaptain = player.id === team?.vice_captain_id;
  
  // Find slot name from slot ID
  const playerSlot = slots?.find(slot => slot.id === player.slot);
  const slotName = playerSlot?.name || player.slot;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg.body }}>
        {/* Header */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 16,
          borderBottomWidth: 1,
          borderBottomColor: theme.border.subtle
        }}>
          <Text style={{
            fontSize: 18,
            fontWeight: 'bold',
            color: theme.text.main
          }}>
            Player Details
          </Text>
          <Pressable onPress={onClose}>
            <Ionicons name="close" size={24} color={theme.text.main} />
          </Pressable>
        </View>

        <ScrollView style={{ flex: 1 }}>
          {/* Player Header Card */}
          <View style={{
            backgroundColor: theme.accent.pink.primary,
            margin: 16,
            borderRadius: 16,
            padding: 20,
            flexDirection: 'row',
            alignItems: 'center'
          }}>
            <PlayerImage 
              imageUrl={player.image_url} 
              playerName={player.name}
              size={80} 
            />
            <View style={{ marginLeft: 16, flex: 1 }}>
              <Text style={{
                fontSize: 20,
                fontWeight: 'bold',
                color: 'white',
                marginBottom: 4
              }}>
                {player.name}
              </Text>
              {player.team && (
                <Text style={{
                  fontSize: 16,
                  color: 'white',
                  opacity: 0.9
                }}>
                  {player.team}
                </Text>
              )}
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginTop: 8,
                gap: 8
              }}>
                {isCaptain && (
                  <View style={{
                    backgroundColor: 'rgba(255,255,255,0.2)',
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 6
                  }}>
                    <Text style={{
                      fontSize: 12,
                      fontWeight: '600',
                      color: 'white'
                    }}>
                      CAPTAIN
                    </Text>
                  </View>
                )}
                {isViceCaptain && (
                  <View style={{
                    backgroundColor: 'rgba(255,255,255,0.2)',
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 6
                  }}>
                    <Text style={{
                      fontSize: 12,
                      fontWeight: '600',
                      color: 'white'
                    }}>
                      VICE-CAPTAIN
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Player Stats */}
          <View style={{
            backgroundColor: theme.bg.card,
            margin: 16,
            borderRadius: 16,
            padding: 20,
            borderWidth: 1,
            borderColor: theme.border.subtle
          }}>
            <Text style={{
              fontSize: 18,
              fontWeight: 'bold',
              color: theme.text.main,
              marginBottom: 16
            }}>
              Statistics
            </Text>
            
            <View style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              marginBottom: 12
            }}>
              <Text style={{
                fontSize: 14,
                color: theme.text.subtle
              }}>
                Points
              </Text>
              <Text style={{
                fontSize: 16,
                fontWeight: '600',
                color: theme.accent.pink.primary
              }}>
                {formatPoints(player.points)}
              </Text>
            </View>

            {player.slot && (
              <View style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginBottom: 12
              }}>
                <Text style={{
                  fontSize: 14,
                  color: theme.text.subtle
                }}>
                  Position
                </Text>
                <Text style={{
                  fontSize: 14,
                  fontWeight: '600',
                  color: theme.text.main
                }}>
                  {slotName}
                </Text>
              </View>
            )}

            <View style={{
              flexDirection: 'row',
              justifyContent: 'space-between'
            }}>
              <Text style={{
                fontSize: 14,
                color: theme.text.subtle
              }}>
                Availability
              </Text>
              <Text style={{
                fontSize: 14,
                fontWeight: '600',
                color: player.is_available ? theme.status.success : theme.status.danger
              }}>
                {player.is_available ? 'Available' : 'Unavailable'}
              </Text>
            </View>
          </View>

          {/* Contest Status */}
          {contest && (
            <View style={{
              backgroundColor: theme.bg.card,
              margin: 16,
              borderRadius: 16,
              padding: 20,
              borderWidth: 1,
              borderColor: theme.border.subtle
            }}>
              <Text style={{
                fontSize: 18,
                fontWeight: 'bold',
                color: theme.text.main,
                marginBottom: 16
              }}>
                Contest Status
              </Text>
              
              <View style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginBottom: 12
              }}>
                <Text style={{
                  fontSize: 14,
                  color: theme.text.subtle
                }}>
                  Contest
                </Text>
                <Text style={{
                  fontSize: 14,
                  fontWeight: '600',
                  color: theme.text.main
                }}>
                  {contest.name}
                </Text>
              </View>

              <View style={{
                flexDirection: 'row',
                justifyContent: 'space-between'
              }}>
                <Text style={{
                  fontSize: 14,
                  color: theme.text.subtle
                }}>
                  Status
                </Text>
                <View style={{
                  backgroundColor: isContestLive ? theme.status.success + '20' : theme.status.warning + '20',
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 6
                }}>
                  <Text style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: isContestLive ? theme.status.success : theme.status.warning
                  }}>
                    {contest.status.toUpperCase()}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Action buttons: only before the contest starts. Ongoing
              contests are locked, same as the website and the API. */}
          {canEdit && (
            <View style={{
              margin: 16,
              gap: 12
            }}>
              {!isCaptain && (
                <GlassButton
                  title="Make Captain"
                  onPress={() => onMakeCaptain(player.id)}
                  size="lg"
                  fullWidth
                />
              )}

              {!isViceCaptain && !isCaptain && (
                <GlassButton
                  title="Make Vice Captain"
                  onPress={() => onMakeViceCaptain(player.id)}
                  tintColor={theme.accent.orange.primary + 'E6'}
                  contentColor="#ffffff"
                  size="lg"
                  fullWidth
                />
              )}

              <GlassButton
                title="Replace Player"
                onPress={() => onReplacePlayer(player.id)}
                variant="secondary"
                size="lg"
                fullWidth
              />
            </View>
          )}

          {/* Why the actions are hidden */}
          {!canEdit && (
            <View style={{
              margin: 16,
              backgroundColor: theme.status.warning + '20',
              padding: 16,
              borderRadius: 12,
              alignItems: 'center'
            }}>
              <Ionicons name="information-circle" size={24} color={theme.status.warning} />
              <Text style={{
                fontSize: 14,
                color: theme.status.warning,
                textAlign: 'center',
                marginTop: 8
              }}>
                {lockedReason}
              </Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}