import React from 'react';
import { View, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeContext } from '../../theme';
import { GlassButton } from '../ui/GlassButton';

interface TeamNameModalProps {
  visible: boolean;
  teamName: string;
  onTeamNameChange: (name: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  isLoading: boolean;
}

export const TeamNameModal: React.FC<TeamNameModalProps> = ({
  visible,
  teamName,
  onTeamNameChange,
  onCancel,
  onConfirm,
  isLoading
}) => {
  const { theme } = useThemeContext();

  if (!visible) return null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg.elevated }} edges={['top']}>
      <View style={{
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        padding: 20
      }}>
        <View style={{
          backgroundColor: theme.bg.card,
          borderRadius: 20,
          padding: 24,
          borderWidth: 1,
          borderColor: theme.border.subtle,
          shadowColor: theme.accent.pink.primary,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.15,
          shadowRadius: 16,
          elevation: 8,
        }}>
          <View style={{
            backgroundColor: theme.accent.pink.faint,
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 20,
            alignSelf: 'flex-start',
            marginBottom: 16,
            flexDirection: 'row',
            alignItems: 'center'
          }}>
            <View style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: theme.accent.pink.primary,
              marginRight: 8
            }} />
            <Text style={{
              fontSize: 12,
              fontWeight: '600',
              color: theme.accent.pink.deep,
              textTransform: 'uppercase'
            }}>
              Required
            </Text>
          </View>

          <Text style={{
            fontSize: 22,
            fontWeight: 'bold',
            color: theme.text.main,
            marginBottom: 8
          }}>
            Name Your Team
          </Text>
          
          <Text style={{
            fontSize: 14,
            color: theme.text.muted,
            marginBottom: 20
          }}>
            Choose a unique name for your fantasy team
          </Text>
          
          <TextInput
            value={teamName}
            onChangeText={onTeamNameChange}
            placeholder="e.g., Golden Strikers"
            style={{
              backgroundColor: theme.bg.cardSoft,
              borderWidth: 1,
              borderColor: theme.border.subtle,
              borderRadius: 12,
              padding: 16,
              fontSize: 16,
              color: theme.text.main,
              marginBottom: 20
            }}
            placeholderTextColor={theme.text.subtle}
            autoFocus
          />

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <GlassButton
              title="Cancel"
              onPress={onCancel}
              variant="secondary"
              size="lg"
              fullWidth
              style={{ flex: 1 }}
            />

            <GlassButton
              title={isLoading ? 'Creating...' : 'Create Team'}
              onPress={onConfirm}
              disabled={isLoading || !teamName.trim()}
              size="lg"
              fullWidth
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};