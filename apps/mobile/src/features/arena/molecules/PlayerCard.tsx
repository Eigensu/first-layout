import React from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import { Player } from '../../../types/arena';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '../../../theme';

interface PlayerCardProps {
  player: Player;
  isSelected: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  onToggle: () => void;
  onSetCaptain?: () => void;
  onSetViceCaptain?: () => void;
  compact?: boolean;
  showCaptainOptions?: boolean;
  /** Greys the card out and ignores taps, e.g. once its slot is full. */
  disabled?: boolean;
  /** The +/✓ circle. Hidden on screens where every card is already
   *  selected (captain pick, review), where a tick on each is just noise. */
  showSelectionIndicator?: boolean;
}

export const PlayerCard: React.FC<PlayerCardProps> = ({
  player,
  isSelected,
  isCaptain,
  isViceCaptain,
  onToggle,
  onSetCaptain,
  onSetViceCaptain,
  compact = false,
  showCaptainOptions = true,
  disabled = false,
  showSelectionIndicator = true,
}) => {
  const { theme } = useThemeContext();

  if (compact) {

    return (
      <Pressable
        onPress={onToggle}
        disabled={disabled}
        style={{
          padding: 8,
          marginBottom: 2,
          borderRadius: 8,
          backgroundColor: isSelected ? theme.accent.pink.primary + '20' : theme.bg.card,
          borderWidth: isSelected ? 2 : 1,
          borderColor: isSelected ? theme.accent.pink.primary : theme.border.subtle,
          width: '48.5%',
          opacity: disabled ? 0.4 : 1,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {/* Player Image */}
          <View style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: theme.bg.chip,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {player.image_url ? (
              <Image
                source={{ uri: player.image_url }}
                style={{ width: 32, height: 32, borderRadius: 16 }}
                onError={() => {
                  // Handle image load error by showing fallback
                }}
              />
            ) : (
              <Ionicons name="person" size={16} color={theme.text.muted} />
            )}
          </View>
          
          {/* Player Info */}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 12,
                  fontWeight: '600',
                  color: theme.text.main,
                }}
              >
                {player.name}
              </Text>
              {isCaptain && (
                <View style={{
                  backgroundColor: theme.status.warning,
                  paddingHorizontal: 4,
                  paddingVertical: 1,
                  borderRadius: 2
                }}>
                  <Text style={{
                    fontSize: 8,
                    fontWeight: 'bold',
                    color: '#ffffff'
                  }}>
                    C
                  </Text>
                </View>
              )}
              {isViceCaptain && (
                <View style={{
                  backgroundColor: theme.accent.orange.primary,
                  paddingHorizontal: 4,
                  paddingVertical: 1,
                  borderRadius: 2
                }}>
                  <Text style={{
                    fontSize: 8,
                    fontWeight: 'bold',
                    color: '#ffffff'
                  }}>
                    VC
                  </Text>
                </View>
              )}
            </View>
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
              {player.team && (
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 9,
                    color: theme.text.subtle,
                    flex: 1,
                  }}
                >
                  {player.team}
                </Text>
              )}
              {player.is_hot_pick ? (
                <View style={{
                  backgroundColor: theme.status.danger,
                  paddingHorizontal: 4,
                  paddingVertical: 1,
                  borderRadius: 3
                }}>
                  <Text style={{
                    fontSize: 8,
                    fontWeight: '600',
                    color: '#ffffff'
                  }}>
                    HOT
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Action Button */}
          {showSelectionIndicator && (
            <View style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isSelected ? theme.accent.pink.primary : theme.bg.chip
            }}>
              <Ionicons
                name={isSelected ? 'checkmark' : 'add'}
                size={14}
                color={isSelected ? '#ffffff' : theme.text.muted}
              />
            </View>
          )}
        </View>

        {/* Captain/VC buttons for compact view - only show when enabled */}
        {isSelected && showCaptainOptions && (onSetCaptain || onSetViceCaptain) && (
          <View style={{ flexDirection: 'row', gap: 4, marginTop: 6, justifyContent: 'center' }}>
            {onSetCaptain && !isViceCaptain && (
              <Pressable
                onPress={onSetCaptain}
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 4,
                  backgroundColor: isCaptain ? theme.status.warning : theme.bg.chip
                }}
              >
                <Text style={{
                  fontSize: 8,
                  fontWeight: 'bold',
                  color: isCaptain ? '#ffffff' : theme.text.muted
                }}>
                  Captain
                </Text>
              </Pressable>
            )}
            
            {onSetViceCaptain && !isCaptain && (
              <Pressable
                onPress={onSetViceCaptain}
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 4,
                  backgroundColor: isViceCaptain ? theme.accent.orange.primary : theme.bg.chip
                }}
              >
                <Text style={{
                  fontSize: 8,
                  fontWeight: 'bold',
                  color: isViceCaptain ? '#ffffff' : theme.text.muted
                }}>
                  Vice
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </Pressable>
    );
  }
  
  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      style={{
        padding: 16,
        marginBottom: 8,
        borderRadius: 12,
        backgroundColor: isSelected ? theme.accent.pink.primary + '20' : theme.bg.card,
        borderWidth: isSelected ? 2 : 1,
        borderColor: isSelected ? theme.accent.pink.primary : theme.border.subtle,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
          {/* Player Image */}
          <View style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: theme.bg.chip,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {player.image_url ? (
              <Image
                source={{ uri: player.image_url }}
                style={{ width: 48, height: 48, borderRadius: 24 }}
                onError={() => {
                  // Handle image load error by showing fallback
                }}
              />
            ) : (
              <Ionicons name="person" size={24} color={theme.text.muted} />
            )}
          </View>
          
          {/* Player Info */}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{
                fontSize: 16,
                fontWeight: '600',
                color: theme.text.main
              }}>
                {player.name}
              </Text>
            {isCaptain && (
              <View style={{
                backgroundColor: theme.status.warning,
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 4
              }}>
                <Text style={{
                  fontSize: 10,
                  fontWeight: 'bold',
                  color: '#ffffff'
                }}>
                  C
                </Text>
              </View>
            )}
            {isViceCaptain && (
              <View style={{
                backgroundColor: theme.accent.orange.primary,
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 4
              }}>
                <Text style={{
                  fontSize: 10,
                  fontWeight: 'bold',
                  color: '#ffffff'
                }}>
                  VC
                </Text>
              </View>
            )}
            </View>
            
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 4, alignItems: 'center' }}>
              {player.team && (
                <Text style={{
                  fontSize: 12,
                  color: theme.text.subtle,
                  flex: 1
                }}>
                  {player.team}
                </Text>
              )}
              {player.is_hot_pick ? (
                <View style={{
                  backgroundColor: theme.status.danger,
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: 4
                }}>
                  <Text style={{
                    fontSize: 10,
                    fontWeight: '600',
                    color: '#ffffff'
                  }}>
                    HOT PICK
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          {isSelected && showCaptainOptions && onSetCaptain && !isViceCaptain && (
            <Pressable
              onPress={onSetCaptain}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isCaptain ? theme.status.warning : theme.bg.chip
              }}
            >
              <Text style={{
                fontSize: 10,
                fontWeight: 'bold',
                color: isCaptain ? '#ffffff' : theme.text.muted
              }}>
                C
              </Text>
            </Pressable>
          )}
          
          {isSelected && showCaptainOptions && onSetViceCaptain && !isCaptain && (
            <Pressable
              onPress={onSetViceCaptain}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isViceCaptain ? theme.accent.orange.primary : theme.bg.chip
              }}
            >
              <Text style={{
                fontSize: 10,
                fontWeight: 'bold',
                color: isViceCaptain ? '#ffffff' : theme.text.muted
              }}>
                VC
              </Text>
            </Pressable>
          )}

          {showSelectionIndicator && (
            <View style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isSelected ? theme.accent.pink.primary : theme.bg.chip
            }}>
              <Ionicons
                name={isSelected ? 'checkmark' : 'add'}
                size={20}
                color={isSelected ? '#ffffff' : theme.text.muted}
              />
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
};
