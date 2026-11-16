import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useThemeContext } from '../../theme';
import { useTournamentStore } from '../../core/store/tournamentStore';
import { useAuthStore } from '../../core/store/authStore';
import { TournamentPickerModal } from './TournamentPickerModal';
import { BannerText } from '../ui/BannerText';
import { HeaderSurface } from '../ui/ScreenHeader';
import { GlassButton } from '../ui/GlassButton';

/**
 * Landing header with the active tournament.
 *
 * Guests can tap the pill to switch tournaments inline. Once signed in the
 * pill is read-only — a session only works against its own tournament's
 * backend, so switching (and the sign-out it forces) lives in Profile alone.
 */
interface TournamentHeaderProps {
  onHeightChange?: (height: number) => void;
}

export const TournamentHeader: React.FC<TournamentHeaderProps> = ({ onHeightChange }) => {
  const { theme, isDark } = useThemeContext();
  const router = useRouter();
  const { selectedTournament } = useTournamentStore();
  const { isAuthenticated } = useAuthStore();
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <HeaderSurface onHeightChange={onHeightChange}>
      {/* Wide, geometric retail-banner wordmark */}
      <BannerText
        style={{
          fontSize: 14,
          color: theme.text.main,
          marginBottom: 8,
        }}
      >
        Wall-E Arena
      </BannerText>

      {/* Tournament row — a picker for guests, read-only once signed in.
          Built as its own plain BlurView pill (not GlassButton) because the
          growing Text inside it needs an unambiguous full-width row to
          expand against — routing it through GlassButton's shared, centered
          content row fought that and collapsed the text to nothing. */}
      {/* gap is a real 16px in layout — the earlier 10px was likely there
          too, just not perceptible: the space between the two pills renders
          in the header's own near-opaque background, which sits close in
          tone to the pill's own translucent fill, so a thin gap doesn't read
          as a visible seam. Widening it is the fix for that, not the
          mechanism (marginLeft and gap are equivalent here). */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <TouchableOpacity
          onPress={() => setPickerOpen(true)}
          activeOpacity={isAuthenticated ? 1 : 0.7}
          disabled={isAuthenticated}
          style={{
            flex: 1,
            borderRadius: 14,
            overflow: 'hidden',
          }}
        >
          <BlurView
            intensity={isDark ? 40 : 30}
            tint={isDark ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(180,95,191,0.14)',
              },
            ]}
          />
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 12,
              // Matches GlassButton's "sm" size paddingVertical so this pill
              // and the Login button next to it render at the same height.
              paddingVertical: 8,
            }}
          >
            <Ionicons name="trophy" size={15} color={theme.accent.pink.primary} />
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                marginLeft: 8,
                fontSize: 13,
                fontFamily: theme.fonts.semiBold,
                color: theme.text.main,
              }}
            >
              {selectedTournament ? selectedTournament.title : 'Select Tournament'}
              {selectedTournament?.game_name ? (
                <Text style={{ fontFamily: theme.fonts.semiBold, color: theme.text.subtle }}>
                  {'  ·  ' + selectedTournament.game_name.toUpperCase()}
                </Text>
              ) : null}
            </Text>
            {!isAuthenticated && (
              <Ionicons name="chevron-down" size={18} color={theme.text.subtle} />
            )}
          </View>
        </TouchableOpacity>

        {/* Login affordance for guests */}
        {!isAuthenticated && (
          <GlassButton
            title="Login"
            onPress={() => router.push('/(auth)/login')}
            size="sm"
            textStyle={{ fontSize: 13 }}
          />
        )}
      </View>

      <TournamentPickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
      />
    </HeaderSurface>
  );
};
