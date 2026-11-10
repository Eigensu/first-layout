import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { tournamentService } from '../src/services/tournamentService';
import { TournamentCard } from '../src/components/home/TournamentCard';
import { useThemeContext } from '../src/theme';
import { useTournamentStore } from '../src/core/store/tournamentStore';
import { useTournamentSwitch } from '../src/core/hooks/useTournamentSwitch';

const STATUS_ORDER: Record<string, number> = { LIVE: 0, UPCOMING: 1, COMPLETED: 2 };

export default function AllTournamentsScreen() {
  const { theme } = useThemeContext();
  const router = useRouter();
  const { selectedTournament, setTournaments } = useTournamentStore();
  const { switchTournament } = useTournamentSwitch();

  const { data, isLoading } = useQuery({
    queryKey: ['tournaments'],
    queryFn: () => tournamentService.getTournaments(),
  });

  useEffect(() => {
    if (data) setTournaments(data);
  }, [data, setTournaments]);

  const sorted = [...(data || [])].sort(
    (a, b) => (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3)
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg.body }}>
      <LinearGradient
        colors={theme.gradient.screen as [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />

      <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }} edges={['top']}>
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 12,
            paddingVertical: 12,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.bg.card,
              marginRight: 12,
            }}
          >
            <Ionicons name="chevron-back" size={22} color={theme.text.main} />
          </Pressable>
          <Text
            style={{
              fontSize: 22,
              fontFamily: theme.fonts.bold,
              color: theme.text.main,
            }}
          >
            All Tournaments
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {sorted.length > 0 ? (
            sorted.map((t) => (
              <TournamentCard
                key={t.id}
                tournament={t}
                selected={selectedTournament?.id === t.id}
                onPress={() => {
                  switchTournament(t);
                  // Signed in or not, switching keeps you where you were.
                  router.back();
                }}
              />
            ))
          ) : (
            <View style={{ alignItems: 'center', paddingVertical: 80 }}>
              <Ionicons name="trophy-outline" size={48} color={theme.text.subtle} />
              <Text style={{ color: theme.text.subtle, marginTop: 12 }}>
                {isLoading ? 'Loading tournaments...' : 'No tournaments found'}
              </Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
