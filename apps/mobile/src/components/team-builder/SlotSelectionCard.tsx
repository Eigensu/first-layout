import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '../../theme';

interface SlotSelectionCardProps {
  currentSlot: any;
  currentSlotSelectedCount: number;
  canProceedFromCurrentSlot: boolean;
  totalTeamCount: number;
}

export const SlotSelectionCard: React.FC<SlotSelectionCardProps> = ({
  currentSlot,
  currentSlotSelectedCount,
  canProceedFromCurrentSlot,
  totalTeamCount
}) => {
  const { theme } = useThemeContext();

  // Only show if there's a requirement message and we need more players
  const playersNeeded = currentSlot.min_select - currentSlotSelectedCount;
  if (canProceedFromCurrentSlot || playersNeeded <= 0) {
    return null;
  }

  return (
    <View style={{
      marginHorizontal: 16,
      marginBottom: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: theme.status.warning + '14',
      borderWidth: 1,
      borderColor: theme.status.warning + '40',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      shadowColor: theme.status.warning,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 6,
      elevation: 1
    }}>
      <View style={{
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: theme.status.warning + '22',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <Ionicons name="alert-circle" size={20} color={theme.status.warning} />
      </View>
      <Text style={{
        fontSize: 13,
        color: theme.text.main,
        fontWeight: '600',
        flex: 1
      }}>
        Need <Text style={{ color: theme.status.warning, fontWeight: '800' }}>{playersNeeded} more</Text> to continue
      </Text>
    </View>
  );
};