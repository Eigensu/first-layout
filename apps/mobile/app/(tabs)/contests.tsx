import { View, Text, FlatList, RefreshControl, Pressable, Animated, Dimensions, Easing } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { arenaService } from '../../src/services/arenaService';
import { arenaKeys } from '../../src/features/arena/queryKeys';
import { ContestCard } from '../../src/features/arena/molecules/ContestCard';
import { ContestStatus } from '../../src/types/arena';
import { GlassScreen } from '../../src/components/ui/GlassScreen';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { NewsCarousel } from '../../src/components/home/NewsCarousel';
import { useThemeContext } from '../../src/theme';
import { useTournamentStore } from '../../src/core/store/tournamentStore';
import { useAuthStore } from '../../src/core/store/authStore';
import { useCarousel } from '../../src/hooks/useCarousel';

export default function ContestsScreen() {
  const { theme, isDark } = useThemeContext();
  const router = useRouter();
  const { selectedTournament } = useTournamentStore();
  const { isAuthenticated } = useAuthStore();
  const { items: carouselItems } = useCarousel();
  const [selectedStatus, setSelectedStatus] = useState<ContestStatus | null>(null);
  const [headerHeight, setHeaderHeight] = useState(150);

  // Slides the whole screen in from the right the first time this tab
  // mounts, so jumping here (e.g. from a tournament card) reads as a
  // deliberate "enter" rather than an instant tab swap. Tab screens stay
  // mounted once visited, so this plays once per app session rather than on
  // every switch back to the tab.
  const slideAnim = useRef(new Animated.Value(Dimensions.get('window').width * 0.2)).current;
  const fadeAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  }, [slideAnim, fadeAnim]);

  // Contests are public; only fetch once a tournament context exists.
  const shouldFetchData = !!selectedTournament;

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: arenaKeys.contestList({ status: selectedStatus, pageSize: 50 }),
    queryFn: () => arenaService.getContests({
      page: 1,
      page_size: 50,
      status: selectedStatus || undefined,
    }),
    enabled: shouldFetchData,
  });

  const { data: enrollments } = useQuery({
    queryKey: arenaKeys.enrollments(),
    queryFn: () => arenaService.getMyEnrollments(),
    enabled: shouldFetchData && isAuthenticated,
  });

  const { data: teams } = useQuery({
    queryKey: arenaKeys.teams(),
    queryFn: () => arenaService.getMyTeams({ limit: 100 }),
    enabled: shouldFetchData && isAuthenticated,
  });

  const statusFilters: Array<{ label: string; value: ContestStatus | null }> = [
    { label: 'All', value: null },
    { label: 'Live', value: 'live' },
    { label: 'Ongoing', value: 'ongoing' },
    { label: 'Completed', value: 'completed' },
  ];

  return (
    <Animated.View
      style={{
        flex: 1,
        backgroundColor: theme.bg.body,
        opacity: fadeAnim,
        transform: [{ translateX: slideAnim }],
      }}
    >
    <GlassScreen edges={[]}>
      <ScreenHeader title="Contests" onHeightChange={setHeaderHeight}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {statusFilters.map((filter) => {
            const active = selectedStatus === filter.value;
            return (
              <Pressable
                key={filter.label}
                onPress={() => setSelectedStatus(filter.value)}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 20,
                  backgroundColor: active
                    ? theme.accent.pink.primary
                    : isDark
                      ? theme.bg.elevated
                      : theme.bg.card,
                  borderWidth: 1,
                  borderColor: active ? theme.accent.pink.primary : theme.border.subtle,
                }}
              >
                <Text
                  style={{
                    fontFamily: theme.fonts.semiBold,
                    color: active ? theme.text.button : theme.text.muted,
                  }}
                >
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScreenHeader>

      {/* List */}
      <FlatList
        data={data?.contests || []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const enrollment = enrollments?.find(
            (e) => e.contest_id === item.id && e.status === 'active'
          );
          const enrolledTeam = enrollment
            ? teams?.teams.find((t) => t.id === enrollment.team_id)
            : undefined;

          return (
            <ContestCard
              contest={item}
              onPress={() =>
                router.push(
                  (isAuthenticated
                    ? `/contest/${item.id}`
                    : `/contest/${item.id}/leaderboard`) as any
                )
              }
              isEnrolled={!!enrollment}
              enrolledTeamId={enrolledTeam?.id}
              isAuthenticated={isAuthenticated}
            />
          );
        }}
        // Same gap under the header as My Teams and Profile, so the first
        // card doesn't butt against it when there's no carousel above.
        contentContainerStyle={{
          paddingTop: headerHeight + 16,
          paddingBottom: 120,
        }}
        ListHeaderComponent={
          carouselItems.length > 0 ? (
            // The list itself carries no horizontal padding (ContestCard
            // applies its own marginHorizontal), so the carousel is
            // naturally full-bleed here with no cancelling margin needed.
            <View style={{ marginBottom: 16 }}>
              <NewsCarousel items={carouselItems} />
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={theme.accent.pink.primary}
            colors={[theme.accent.pink.primary]}
            progressBackgroundColor={theme.bg.elevated}
          />
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 80 }}>
            <Text style={{ color: theme.text.subtle }}>
              {isLoading ? 'Loading contests...' : 'No contests found'}
            </Text>
          </View>
        }
      />
    </GlassScreen>
    </Animated.View>
  );
}
