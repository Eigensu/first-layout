import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '../theme';
import { useTournamentStore } from '../core/store/tournamentStore';
import { TournamentPickerModal } from './home/TournamentPickerModal';
import { SurfaceCard } from './ui/SurfaceCard';

/**
 * The one place a signed-in user can change tournament. Each tournament runs
 * on its own backend, so the picker signs them out and sends them to login
 * with the new tournament already selected.
 */
export const TournamentSwitcher: React.FC = () => {
  const { theme } = useThemeContext();
  const { selectedTournament } = useTournamentStore();
  const [pickerOpen, setPickerOpen] = useState(false);

  if (!selectedTournament) {
    return null;
  }

  return (
    <SurfaceCard padding={16} style={{ marginBottom: 12 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
        }}
      >
        <Text style={{ fontSize: 17, fontFamily: theme.fonts.bold, color: theme.text.main }}>
          Tournament
        </Text>
        <TouchableOpacity onPress={() => setPickerOpen(true)} hitSlop={8}>
          <Text
            style={{
              fontSize: 12,
              fontFamily: theme.fonts.semiBold,
              color: theme.accent.pink.primary,
              letterSpacing: 0.6,
            }}
          >
            SWITCH
          </Text>
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            backgroundColor: theme.accent.pink.primary + '22',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 12,
          }}
        >
          <Ionicons name="trophy" size={18} color={theme.accent.pink.primary} />
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
            {selectedTournament.title}
          </Text>
          <Text style={{ fontSize: 12, color: theme.text.subtle }}>
            {selectedTournament.game_name?.toUpperCase()}
          </Text>
        </View>
      </View>

      <Text style={{ fontSize: 12, color: theme.text.subtle, marginTop: 10 }}>
        One account works in every tournament, so you stay signed in when you
        switch.
      </Text>

      <TournamentPickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
      />
    </SurfaceCard>
  );
};
