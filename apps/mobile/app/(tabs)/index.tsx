import { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { tournamentService } from '../../src/services/tournamentService';
import { NewsCarousel } from '../../src/components/home/NewsCarousel';
import { TournamentCard } from '../../src/components/home/TournamentCard';
import { TournamentHeader } from '../../src/components/home/TournamentHeader';
import { PerformanceWidgets } from '../../src/components/home/PerformanceWidgets';
import { SurfaceCard } from '../../src/components/ui/SurfaceCard';
import { Skeleton } from '../../src/components/ui/Skeleton';
import { GlassButton } from '../../src/components/ui/GlassButton';
import { useThemeContext } from '../../src/theme';
import { useTournamentStore } from '../../src/core/store/tournamentStore';
import { useAuthStore } from '../../src/core/store/authStore';
import { useTournamentSwitch } from '../../src/core/hooks/useTournamentSwitch';
import { useCarousel } from '../../src/hooks/useCarousel';

const ADVANTAGES = [
  {
    icon: 'trophy-outline' as const,
    title: 'Compete & Win',
    desc: 'Build your dream team and battle in fantasy tournaments.',
  },
  {
    icon: 'people-outline' as const,
    title: 'Team Builder',
    desc: 'Strategic picks with real stats and insights.',
  },
  {
    icon: 'trending-up-outline' as const,
    title: 'Live Leaderboards',
    desc: 'Track your rank and climb against players worldwide.',
  },
  {
    icon: 'shield-checkmark-outline' as const,
    title: 'Fair & Secure',
    desc: 'Safe gameplay with transparent scoring.',
  },
];

export default function HomeScreen() {
  const { theme } = useThemeContext();
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const { selectedTournament } = useTournamentStore();
  const { switchTournament } = useTournamentSwitch();
  const { items: carouselItems } = useCarousel();
  const [headerHeight, setHeaderHeight] = useState(96);

  // Shares the cache key with the root bootstrap, which owns picking a
  // default — this screen only reads.
  const { data: tournamentsData, isLoading: tournamentsLoading } = useQuery({
    queryKey: ['tournaments'],
    queryFn: () => tournamentService.getTournaments(),
  });

  const activeTournaments = (tournamentsData || []).filter(
    (t) => t.status === 'LIVE' || t.status === 'UPCOMING'
  );
  const shownTournaments = activeTournaments.slice(0, 4);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg.body }}>
      <LinearGradient
        colors={theme.gradient.screen as [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />

      {/* No top edge here: TournamentHeader paints its own status-bar inset
          and floats above the ScrollView, so its glass blur has scrolled
          content to show through. */}
      <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }} edges={[]}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingTop: headerHeight, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
        >
          {/* News carousel — real feed with placeholder fallback. Same gap
              treatment as the Contests tab: a small marginTop so it doesn't
              sit flush against the floating header. */}
          <View style={{ marginTop: 10 }}>
            <NewsCarousel items={carouselItems} />
          </View>

          {isAuthenticated ? (
            /* Signed in: the home page is the user's own season. Tournament
               switching lives in Profile, so no tournament list here. */
            <View style={{ marginTop: 24 }}>
              <PerformanceWidgets />
            </View>
          ) : (
            <>
              {/* Tournaments — guests can browse and pick freely */}
              <View style={{ marginTop: 24, paddingHorizontal: 12 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 12,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 20,
                      fontFamily: theme.fonts.bold,
                      color: theme.text.main,
                    }}
                  >
                    Tournaments
                  </Text>
                  <Pressable
                    onPress={() => router.push('/tournaments')}
                    style={{ flexDirection: 'row', alignItems: 'center' }}
                    hitSlop={8}
                  >
                    <Text
                      style={{
                        color: theme.accent.pink.primary,
                        fontFamily: theme.fonts.semiBold,
                        marginRight: 2,
                      }}
                    >
                      View All
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={theme.accent.pink.primary}
                    />
                  </Pressable>
                </View>

                {tournamentsLoading ? (
                  [0, 1, 2].map((i) => (
                    <SurfaceCard key={i} style={{ marginBottom: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Skeleton width={44} height={44} radius={14} />
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Skeleton width="70%" height={14} />
                          <Skeleton width="40%" height={10} style={{ marginTop: 8 }} />
                        </View>
                      </View>
                    </SurfaceCard>
                  ))
                ) : shownTournaments.length > 0 ? (
                  shownTournaments.map((t) => (
                    <TournamentCard
                      key={t.id}
                      tournament={t}
                      selected={selectedTournament?.id === t.id}
                      onPress={() => {
                        // First tap selects the tournament; tapping the
                        // already-selected one again browses its contests.
                        if (selectedTournament?.id === t.id) {
                          router.push('/(tabs)/contests');
                          return;
                        }
                        switchTournament(t);
                      }}
                    />
                  ))
                ) : (
                  <SurfaceCard>
                    <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                      <Ionicons
                        name="trophy-outline"
                        size={40}
                        color={theme.text.subtle}
                      />
                      <Text style={{ color: theme.text.subtle, marginTop: 8 }}>
                        No active tournaments right now
                      </Text>
                    </View>
                  </SurfaceCard>
                )}
              </View>

              {/* Advantages */}
              <View style={{ marginTop: 24, paddingHorizontal: 12 }}>
                <Text
                  style={{
                    fontSize: 20,
                    fontFamily: theme.fonts.bold,
                    color: theme.text.main,
                    marginBottom: 4,
                  }}
                >
                  Why Wall-E Arena
                </Text>
                <Text style={{ color: theme.text.muted, marginBottom: 14 }}>
                  Everything you need to play, compete, and win.
                </Text>

                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                  }}
                >
                  {ADVANTAGES.map((a) => (
                    <SurfaceCard
                      key={a.title}
                      style={{ width: '48%', marginBottom: 12 }}
                      padding={14}
                    >
                      <View
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 12,
                          backgroundColor: theme.accent.pink.primary + '22',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginBottom: 10,
                        }}
                      >
                        <Ionicons
                          name={a.icon}
                          size={20}
                          color={theme.accent.pink.primary}
                        />
                      </View>
                      <Text
                        style={{
                          fontSize: 16,
                          fontFamily: theme.fonts.semiBold,
                          color: theme.text.main,
                          marginBottom: 4,
                        }}
                      >
                        {a.title}
                      </Text>
                      <Text style={{ fontSize: 12, color: theme.text.muted, lineHeight: 17 }}>
                        {a.desc}
                      </Text>
                    </SurfaceCard>
                  ))}
                </View>
              </View>
            </>
          )}

          {/* CTA */}
          <View style={{ marginTop: 12, paddingHorizontal: 12 }}>
            <SurfaceCard padding={20}>
              <Text
                style={{
                  fontSize: 20,
                  fontFamily: theme.fonts.bold,
                  color: theme.text.main,
                  marginBottom: 6,
                }}
              >
                {isAuthenticated ? 'Ready to compete?' : 'Ready to play?'}
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: theme.text.muted,
                  marginBottom: 16,
                  lineHeight: 20,
                }}
              >
                {isAuthenticated
                  ? 'Pick a contest and start building your team.'
                  : 'Log in to build teams, join contests, and climb the leaderboards.'}
              </Text>
              <GlassButton
                title={isAuthenticated ? 'Go to Contests' : 'Login to Play'}
                icon="arrow-forward"
                iconPosition="right"
                onPress={() =>
                  isAuthenticated
                    ? router.push('/(tabs)/contests')
                    : router.push('/(auth)/login')
                }
              />
            </SurfaceCard>
          </View>
        </ScrollView>

        <TournamentHeader onHeightChange={setHeaderHeight} />
      </SafeAreaView>
    </View>
  );
}
