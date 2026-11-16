import React from 'react';
import { View, Text } from 'react-native';
import { useThemeContext } from '../../theme';

interface CaptainSelectionCardProps {
  captainId: string;
  viceCaptainId: string;
}

export const CaptainSelectionCard: React.FC<CaptainSelectionCardProps> = ({
  captainId,
  viceCaptainId
}) => {
  const { theme } = useThemeContext();

  return (
    <View style={{
      backgroundColor: theme.bg.card,
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: theme.border.subtle
    }}>
      <Text style={{
        fontSize: 20,
        fontWeight: 'bold',
        color: theme.text.main,
        marginBottom: 8
      }}>
        Choose Captain & Vice-Captain
      </Text>
      <Text style={{
        fontSize: 14,
        color: theme.text.muted,
        marginBottom: 12
      }}>
        Captain gets 2x points, Vice-Captain gets 1.5x points
      </Text>

      {/* Captain/VC Status */}
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
        <View style={{
          flex: 1,
          backgroundColor: captainId ? theme.status.success + '20' : theme.bg.cardSoft,
          padding: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: captainId ? theme.status.success : theme.border.subtle
        }}>
          <Text style={{ fontSize: 12, color: theme.text.subtle, marginBottom: 4 }}>
            Captain (2x)
          </Text>
          <Text style={{
            fontSize: 14,
            fontWeight: '600',
            color: captainId ? theme.status.success : theme.text.muted
          }}>
            {captainId ? 'Selected' : 'Not Selected'}
          </Text>
        </View>
        <View style={{
          flex: 1,
          backgroundColor: viceCaptainId ? theme.status.success + '20' : theme.bg.cardSoft,
          padding: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: viceCaptainId ? theme.status.success : theme.border.subtle
        }}>
          <Text style={{ fontSize: 12, color: theme.text.subtle, marginBottom: 4 }}>
            Vice-Captain (1.5x)
          </Text>
          <Text style={{
            fontSize: 14,
            fontWeight: '600',
            color: viceCaptainId ? theme.status.success : theme.text.muted
          }}>
            {viceCaptainId ? 'Selected' : 'Not Selected'}
          </Text>
        </View>
      </View>
    </View>
  );
};