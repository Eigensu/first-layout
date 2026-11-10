import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { arenaService } from "../../src/services/arenaService";
import { Ionicons } from "@expo/vector-icons";
import { useThemeContext } from "../../src/theme";
import { useTournamentStore } from "../../src/core/store/tournamentStore";
import { useAuthStore } from "../../src/core/store/authStore";
import { GlassScreen } from "../../src/components/ui/GlassScreen";
import { ScreenHeader } from "../../src/components/ui/ScreenHeader";
import { SurfaceCard } from "../../src/components/ui/SurfaceCard";
import { GlassButton } from "../../src/components/ui/GlassButton";
import { LoginRequired } from "../../src/components/auth/LoginRequired";
import { formatPoints } from "../../src/utils/points";
import { arenaKeys } from "../../src/features/arena/queryKeys";
import {
  findTeamStanding,
  useMyContestLeaderboards,
} from "../../src/features/arena/hooks/useMyContestLeaderboards";
import { useMemo, useState } from "react";

export default function MyTeamsScreen() {
  const { theme } = useThemeContext();
  const router = useRouter();
  const { selectedTournament } = useTournamentStore();
  const { isAuthenticated } = useAuthStore();
  const [headerHeight, setHeaderHeight] = useState(96);

  // My Teams is an authenticated-only view; gate it for guests.
  const shouldFetchData = !!selectedTournament && isAuthenticated;

  const { data, isLoading } = useQuery({
    queryKey: arenaKeys.teams(),
    queryFn: () => arenaService.getMyTeams({ limit: 100 }),
    enabled: shouldFetchData,
  });

  const { data: enrollments } = useQuery({
    queryKey: arenaKeys.enrollments(),
    queryFn: () => arenaService.getMyEnrollments(),
    enabled: shouldFetchData,
  });

  const { data: contestsData } = useQuery({
    queryKey: arenaKeys.contestList({ pageSize: 100 }),
    queryFn: () => arenaService.getContests({ page: 1, page_size: 100 }),
    enabled: shouldFetchData,
  });

  // Active enrollments only, the same set Home uses, so both screens share
  // one leaderboards query.
  const contestIds = useMemo(() => {
    const active = (enrollments || []).filter((e) => e.status === "active");
    return [...new Set(active.map((e) => e.contest_id))];
  }, [enrollments]);

  const { data: leaderboards = {} } = useMyContestLeaderboards(
    contestIds,
    shouldFetchData,
  );

  const handleTeamPress = (teamId: string) => {
    router.push(`/team/${teamId}`);
  };

  if (!isAuthenticated) {
    return (
      <LoginRequired message="Log in to build, view, and track your teams across contests." />
    );
  }

  if (isLoading) {
    return (
      <GlassScreen>
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <ActivityIndicator size="large" color={theme.accent.pink.primary} />
        </View>
      </GlassScreen>
    );
  }

  const teams = data?.teams || [];
  const enrollmentsList = enrollments || [];
  const contests = contestsData?.contests || [];

  const getTeamLeaderboardPosition = (teamId: string, contestId: string) =>
    findTeamStanding(leaderboards[contestId], teamId)?.rank ?? null;

  return (
    <GlassScreen edges={[]}>
      <ScreenHeader title="My Teams" onHeightChange={setHeaderHeight} />

      <FlatList
        data={teams}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const enrollment = enrollmentsList.find((e) => e.team_id === item.id);
          const contest = enrollment
            ? contests.find((c) => c.id === enrollment.contest_id)
            : null;
          const leaderboardPosition = enrollment
            ? getTeamLeaderboardPosition(item.id, enrollment.contest_id)
            : null;

          return (
            <Pressable
              onPress={() => handleTeamPress(item.id)}
              style={{ marginBottom: 12 }}
            >
              <SurfaceCard padding={14}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: contest || leaderboardPosition ? 8 : 0,
                  }}
                >
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text
                      style={{
                        fontSize: 16,
                        fontFamily: theme.fonts.bold,
                        color: theme.text.main,
                        marginBottom: 4,
                      }}
                    >
                      {item.team_name}
                    </Text>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <Ionicons
                        name="people"
                        size={14}
                        color={theme.text.subtle}
                      />
                      <Text style={{ fontSize: 12, color: theme.text.subtle }}>
                        {item.player_ids.length} players
                      </Text>
                    </View>
                  </View>

                  <View style={{ alignItems: "flex-end" }}>
                    <Text
                      style={{
                        fontSize: 18,
                        fontFamily: theme.fonts.bold,
                        color: theme.accent.pink.primary,
                      }}
                    >
                      {formatPoints(item.total_points)}
                    </Text>
                    <Text style={{ fontSize: 10, color: theme.text.subtle }}>
                      pts
                    </Text>
                  </View>
                </View>

                {(contest || leaderboardPosition) && (
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    {enrollment && contest && (
                      <Text
                        style={{
                          fontSize: 12,
                          color: theme.text.muted,
                          fontStyle: "italic",
                          flex: 1,
                        }}
                      >
                        Enrolled in {contest.name}
                      </Text>
                    )}

                    {leaderboardPosition && (
                      <View
                        style={{
                          backgroundColor:
                            leaderboardPosition <= 3
                              ? theme.accent.pink.primary
                              : theme.bg.chip,
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: 12,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <Ionicons
                          name="trophy"
                          size={12}
                          color={
                            leaderboardPosition <= 3
                              ? "#ffffff"
                              : theme.text.main
                          }
                        />
                        <Text
                          style={{
                            fontSize: 12,
                            fontFamily: theme.fonts.semiBold,
                            color:
                              leaderboardPosition <= 3
                                ? "#ffffff"
                                : theme.text.main,
                          }}
                        >
                          #{leaderboardPosition}
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </SurfaceCard>
            </Pressable>
          );
        }}
        contentContainerStyle={{
          paddingHorizontal: 16,
          // Same small gap Home and Contests add below the floating header
          // so the first card doesn't sit flush against it.
          paddingTop: headerHeight + 16,
          paddingBottom: 120,
        }}
        ListEmptyComponent={
          <View
            style={{
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 48,
            }}
          >
            <Ionicons
              name="people-outline"
              size={64}
              color={theme.text.subtle}
            />
            <Text
              style={{ color: theme.text.muted, marginTop: 16, fontSize: 16 }}
            >
              No teams created yet
            </Text>
          </View>
        }
        ListFooterComponent={
          <View style={{ marginTop: 8, width: "100%" }}>
            <GlassButton
              title="View Leaderboards"
              icon="trophy"
              iconPosition="left"
              onPress={() => router.push("/leaderboard")}
              size="lg"
              fullWidth
            />
          </View>
        }
      />
    </GlassScreen>
  );
}
