import React from 'react';
import { View, Text, TextInput } from 'react-native';
import { Slot } from '../../../types/arena';
import { useThemeContext } from '../../../theme';

interface TeamSummaryProps {
  count: number;
  slotCounts: Record<string, number>;
  slotViolations: Array<{ slot: Slot; actual: number }>;
  slots: Slot[];
  teamName?: string;
  onTeamNameChange?: (name: string) => void;
  showTeamNameInput?: boolean;
}

export const TeamSummary: React.FC<TeamSummaryProps> = ({
  count,
  slotCounts,
  slotViolations,
  slots,
  teamName = '',
  onTeamNameChange,
  showTeamNameInput = false,
}) => {
  const { theme } = useThemeContext();
  const totalSquadSize = slots.reduce((sum, slot) => sum + slot.max_select, 0);

  return (
    <View style={{
      backgroundColor: theme.bg.cardSoft,
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border.subtle
    }}>
      <View style={{ alignItems: 'center', marginBottom: showTeamNameInput ? 16 : 0 }}>
        <Text style={{ fontSize: 12, color: theme.text.subtle }}>Players Selected</Text>
        <Text style={{
          fontSize: 18,
          fontWeight: 'bold',
          color: (count >= 1 && count <= totalSquadSize) ? theme.status.success : theme.status.danger
        }}>
          {count}/{totalSquadSize}
        </Text>
      </View>

      {showTeamNameInput && onTeamNameChange && (
        <View>
          <Text style={{
            fontSize: 12,
            color: theme.text.subtle,
            marginBottom: 8
          }}>
            Team Name
          </Text>
          <TextInput
            value={teamName}
            onChangeText={onTeamNameChange}
            placeholder="Enter your team name"
            style={{
              backgroundColor: theme.bg.card,
              borderWidth: 1,
              borderColor: theme.border.subtle,
              borderRadius: 8,
              padding: 12,
              fontSize: 16,
              color: theme.text.main
            }}
            placeholderTextColor={theme.text.subtle}
          />
        </View>
      )}

      {slotViolations.length > 0 && (
        <View style={{
          backgroundColor: theme.status.danger + '10',
          padding: 8,
          borderRadius: 8,
          marginTop: showTeamNameInput ? 12 : 0
        }}>
          {slotViolations.map(({ slot, actual }) => (
            <Text key={slot.id} style={{
              fontSize: 10,
              color: theme.status.danger
            }}>
              • {slot.name}: Need {slot.min_select}-{slot.max_select}, have {actual}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
};
