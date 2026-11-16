import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Alert,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { arenaService } from "../../src/services/arenaService";
import { Ionicons } from "@expo/vector-icons";
import { useThemeContext } from "../../src/theme";
import { Player, Slot, TeamUpdate } from "../../src/types/arena";
import { PlayerImage } from "../../src/components/PlayerImage";
import { PlayerDetailModal } from "../../src/components/teams/PlayerDetailModal";
import { ReplacePlayerModal } from "../../src/components/team-builder/ReplacePlayerModal";
import { HeaderSurface } from "../../src/components/ui/ScreenHeader";
import { GlassButton } from "../../src/components/ui/GlassButton";
import { formatPoints } from "../../src/utils/points";
import { apiErrorMessage } from "../../src/utils/apiError";
import {
  arenaKeys,
  invalidateTeamQueries,
} from "../../src/features/arena/queryKeys";
import {
  canEditTeamInContest,
  teamEditingLockedReason,
} from "../../src/features/arena/teamEditing";

export default function TeamDetailScreen() {
  const { theme } = useThemeContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [viewMode, setViewMode] = useState<"pitch" | "list">("pitch");
  const [replaceTarget, setReplaceTarget] = useState<Player | null>(null);
  const [headerHeight, setHeaderHeight] = useState(90);

  // Paints its own status-bar inset with rounded bottom corners, same
  // surface the home tab and other screens use — so the safe area reads as
  // one continuous band instead of a flat native header bar. Floats above
  // the scroll content beneath it so its glass blur has something to show.
  const HeaderBar = ({ title }: { title: string }) => {
    return (
      <HeaderSurface onHeightChange={setHeaderHeight}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color={theme.text.main} />
          </Pressable>
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              textAlign: "center",
              fontSize: 18,
              fontFamily: theme.fonts.bold,
              color: theme.text.main,
            }}
          >
            {title}
          </Text>
          <View style={{ width: 22 }} />
        </View>
      </HeaderSurface>
    );
  };

  const {
    data: team,
    isLoading,
    error,
  } = useQuery({
    queryKey: arenaKeys.team(id),
    queryFn: () => arenaService.getTeam(id!),
    enabled: !!id,
  });

  const { data: players, isLoading: playersLoading } = useQuery({
    queryKey: ["players", "withHotStatus"],
    queryFn: () => arenaService.getPlayersWithHotStatus({ limit: 1000 }),
  });

  // Get slots data for position names
  const { data: slotsData, isLoading: slotsLoading } = useQuery({
    queryKey: ["slots"],
    queryFn: () => arenaService.getSlots({ page_size: 100 }),
  });

  // Get contest details if team is enrolled in one
  const { data: contest } = useQuery({
    queryKey: arenaKeys.contest(team?.contest_id),
    queryFn: () =>
      team?.contest_id ? arenaService.getContest(team.contest_id) : null,
    enabled: !!team?.contest_id,
  });

  // Contest leaderboard, used to show how this team's score compares. The
  // limit is part of the key: the contest's own Leaderboard screen fetches
  // the same board with the API's default limit.
  const { data: leaderboard } = useQuery({
    queryKey: arenaKeys.contestLeaderboard(team?.contest_id, 200),
    queryFn: () => arenaService.getContestLeaderboard(team!.contest_id!, { limit: 200 }),
    enabled: !!team?.contest_id,
  });

  // Contest-scoped team points (same source the leaderboard uses: per-contest
  // player points with captain/vice-captain multipliers applied). team.total_points
  // is a separately-synced field driven by the *global* leaderboard endpoint and
  // does not apply those multipliers, so it can disagree with what shows up here.
  const { data: contestTeam, isLoading: contestTeamLoading } = useQuery({
    queryKey: arenaKeys.contestTeam(team?.contest_id, team?.id),
    queryFn: () => arenaService.getContestTeam(team!.contest_id!, team!.id),
    enabled: !!team?.contest_id && !!team?.id,
  });

  // Same rule as the website: a team can only be changed while its contest
  // is live, i.e. before it starts. Once it's ongoing the API answers 409.
  const canEditTeam = canEditTeamInContest(contest);

  // The contest's status is computed by the server when it's fetched. Ask
  // for it again whenever edit controls are about to show, so a contest that
  // started while this screen was open locks instead of offering edits.
  const refreshContestStatus = () => {
    if (team?.contest_id) {
      queryClient.invalidateQueries({
        queryKey: arenaKeys.contest(team.contest_id),
      });
    }
  };

  const updateTeamMutation = useMutation({
    // No automatic retry: a 409 (contest started) or 400 won't change on a
    // second try, and retrying only delays the error and the lock.
    retry: 0,
    mutationFn: (updateData: TeamUpdate) =>
      arenaService.updateTeam(id!, updateData),
    onSuccess: () => {
      // A new captain or player changes this team's contest points and rank,
      // which Home, My Teams and the leaderboards all show. Refresh those
      // too, not only this screen.
      invalidateTeamQueries(queryClient, {
        teamId: id,
        contestId: team?.contest_id,
      });
      setModalVisible(false);
      Alert.alert("Success", "Team updated successfully");
    },
    onError: (error: any) => {
      // 409 means the contest started after this screen loaded its status.
      // Refetch the contest so the edit controls lock.
      if (error?.response?.status === 409) refreshContestStatus();
      Alert.alert("Error", apiErrorMessage(error, "Failed to update team"));
    },
  });

  // Every edit goes through here. The lock is checked again at save time
  // (not only when the buttons rendered): the refetch started when the
  // sheet opened may have come back "ongoing" while a confirm dialog or the
  // replace sheet was open.
  const saveTeamChange = (updateData: TeamUpdate) => {
    if (!canEditTeamInContest(contest)) {
      setModalVisible(false);
      setReplaceTarget(null);
      Alert.alert("Team locked", teamEditingLockedReason(contest));
      return;
    }
    updateTeamMutation.mutate(updateData);
  };

  const handlePlayerPress = (player: Player) => {
    refreshContestStatus();
    setSelectedPlayer(player);
    setModalVisible(true);
  };

  const handleMakeCaptain = (playerId: string) => {
    Alert.alert(
      "Make Captain",
      "Are you sure you want to make this player the captain?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: () => saveTeamChange({ captain_id: playerId }),
        },
      ],
    );
  };

  const handleMakeViceCaptain = (playerId: string) => {
    Alert.alert(
      "Make Vice Captain",
      "Are you sure you want to make this player the vice captain?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: () => saveTeamChange({ vice_captain_id: playerId }),
        },
      ],
    );
  };

  const handleReplacePlayer = (playerId: string) => {
    const player = players?.find((p) => p.id === playerId);
    if (player) {
      setReplaceTarget(player);
      setModalVisible(false); // Close detail modal
    }
  };

  const confirmReplacement = (newPlayerId: string) => {
    if (!replaceTarget || !team) return;

    const oldPlayerId = replaceTarget.id;
    const newPlayerIds = team.player_ids.filter(
      (id: string) => id !== oldPlayerId,
    );
    newPlayerIds.push(newPlayerId);

    const updateData: TeamUpdate = {
      player_ids: newPlayerIds,
    };

    // Transfer roles
    if (team.captain_id === oldPlayerId) {
      updateData.captain_id = newPlayerId;
    }
    if (team.vice_captain_id === oldPlayerId) {
      updateData.vice_captain_id = newPlayerId;
    }

    saveTeamChange(updateData);
    setReplaceTarget(null);
  };

  if (isLoading || playersLoading || slotsLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg.body }}>
        <Stack.Screen options={{ headerShown: false }} />
        <LinearGradient
          colors={theme.gradient.screen as [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }} edges={[]}>
          <HeaderBar title="Loading..." />
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator size="large" color={theme.accent.pink.primary} />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (error || !team) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg.body }}>
        <Stack.Screen options={{ headerShown: false }} />
        <LinearGradient
          colors={theme.gradient.screen as [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }} edges={[]}>
          <HeaderBar title="Error" />
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Ionicons
              name="alert-circle-outline"
              size={64}
              color={theme.status.danger}
            />
            <Text
              style={{
                color: theme.text.main,
                marginTop: 16,
                fontSize: 18,
                fontWeight: "600",
              }}
            >
              Team not found
            </Text>
            <GlassButton
              title="Go Back"
              onPress={() => router.back()}
              style={{ marginTop: 16 }}
            />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const teamPlayers =
    players?.filter((player) => team.player_ids.includes(player.id)) || [];

  // Prefer contest-scoped points (matches the leaderboard) over the player's
  // raw global points, and over team.total_points for the team's total. While
  // the contest-scoped query is still in flight, show "—" instead of those
  // less-accurate fallbacks so a wrong number never flashes before the real one.
  const contestTeamPending = !!team.contest_id && contestTeamLoading;
  const contestPointsByPlayerId: Record<string, number> = {};
  (contestTeam?.players || []).forEach((p) => {
    contestPointsByPlayerId[p.id] = p.contest_points;
  });
  const getDisplayPoints = (player: Player) =>
    contestTeamPending
      ? "—"
      : formatPoints(contestPointsByPlayerId[player.id] ?? player.points ?? 0);
  const displayTotalPoints = contestTeamPending
    ? "—"
    : formatPoints(contestTeam?.contest_points ?? team.total_points);

  const slots = slotsData?.slots || [];

  // Group the squad by slot, in the order slots are returned by the API.
  const groupedBySlot: Array<{ slot: Slot | null; players: Player[] }> = [];
  slots.forEach((slot) => {
    const inSlot = teamPlayers.filter((p) => p.slot === slot.id);
    if (inSlot.length > 0) groupedBySlot.push({ slot, players: inSlot });
  });
  const knownSlotIds = new Set(slots.map((s) => s.id));
  const unmatched = teamPlayers.filter((p) => !p.slot || !knownSlotIds.has(p.slot));
  if (unmatched.length > 0) groupedBySlot.push({ slot: null, players: unmatched });

  const leaderboardEntries = leaderboard?.entries || [];
  const averagePoints = leaderboardEntries.length
    ? leaderboardEntries.reduce((sum, e) => sum + e.points, 0) / leaderboardEntries.length
    : null;
  const highestPoints = leaderboardEntries.length
    ? Math.max(...leaderboardEntries.map((e) => e.points))
    : null;

  const PlayerBadges = ({ player, size = "small" }: { player: Player; size?: "small" | "tiny" }) => {
    const isCaptain = player.id === team.captain_id;
    const isViceCaptain = player.id === team.vice_captain_id;
    if (!isCaptain && !isViceCaptain) return null;
    const dim = size === "tiny" ? 16 : 20;
    return (
      <View
        style={{
          width: dim,
          height: dim,
          borderRadius: dim / 2,
          backgroundColor: isCaptain ? "#f5c518" : "#c9ccd6",
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1.5,
          borderColor: "#ffffff",
        }}
      >
        <Text style={{ fontSize: dim * 0.5, fontWeight: "800", color: "#1a1a2e" }}>
          {isCaptain ? "C" : "V"}
        </Text>
      </View>
    );
  };

  const PitchPlayerCard = ({ player }: { player: Player }) => (
    <Pressable
      onPress={() => handlePlayerPress(player)}
      style={{ width: 92, alignItems: "center" }}
    >
      <View>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: "rgba(255,255,255,0.22)",
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 2,
            borderColor: "rgba(255,255,255,0.5)",
          }}
        >
          <PlayerImage
            imageUrl={player.image_url}
            playerName={player.name}
            size={50}
          />
        </View>
        <View style={{ position: "absolute", top: -4, left: -4 }}>
          <PlayerBadges player={player} />
        </View>
        {player.injury_status && (
          <View style={{ position: "absolute", top: -4, right: -4 }}>
            <Ionicons name="warning" size={16} color={theme.status.warning} />
          </View>
        )}
      </View>

      <View
        style={{
          backgroundColor: "#ffffff",
          borderRadius: 4,
          paddingHorizontal: 6,
          paddingVertical: 2,
          marginTop: 6,
          width: "100%",
        }}
      >
        <Text
          numberOfLines={1}
          style={{ fontSize: 11, fontWeight: "700", color: "#1a1a2e", textAlign: "center" }}
        >
          {player.name}
        </Text>
      </View>
      <View
        style={{
          backgroundColor: "#1a1a2e",
          borderRadius: 4,
          paddingVertical: 2,
          marginTop: 2,
          width: "100%",
        }}
      >
        <Text style={{ fontSize: 12, fontWeight: "800", color: "#ffffff", textAlign: "center" }}>
          {getDisplayPoints(player)}
        </Text>
      </View>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg.body }}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient
        colors={theme.gradient.screen as [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />

      <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }} edges={[]}>
        <HeaderBar title={team.team_name} />

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingTop: headerHeight + 8, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        >
        {/* Stats trio: Average / Total / Highest */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-around",
            marginHorizontal: 16,
            marginTop: 12,
            marginBottom: 16,
          }}
        >
          <View style={{ alignItems: "center" }}>
            <Text style={{ fontSize: 22, fontWeight: "800", color: theme.text.main }}>
              {averagePoints !== null ? averagePoints.toFixed(1) : "—"}
            </Text>
            <Text style={{ fontSize: 11, color: theme.text.subtle, marginTop: 2 }}>Average</Text>
          </View>

          <LinearGradient
            colors={["#38bdf8", "#6366f1"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              borderRadius: 12,
              paddingHorizontal: 18,
              paddingVertical: 10,
              alignItems: "center",
              minWidth: 100,
            }}
          >
            <Text style={{ fontSize: 26, fontWeight: "800", color: "#ffffff" }}>
              {displayTotalPoints}
            </Text>
            <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.85)" }}>Total Pts</Text>
          </LinearGradient>

          <Pressable
            style={{ alignItems: "center" }}
            disabled={!team.contest_id}
            onPress={() =>
              team.contest_id &&
              router.push(`/contest/${team.contest_id}/leaderboard` as any)
            }
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
              <Text style={{ fontSize: 22, fontWeight: "800", color: theme.text.main }}>
                {highestPoints !== null ? highestPoints.toFixed(1) : "—"}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 2, marginTop: 2 }}>
              <Text style={{ fontSize: 11, color: theme.text.subtle }}>Highest</Text>
              {!!team.contest_id && (
                <Ionicons name="arrow-forward" size={11} color={theme.text.subtle} />
              )}
            </View>
          </Pressable>
        </View>

        {/* View Toggle */}
        <View
          style={{
            flexDirection: "row",
            backgroundColor: theme.bg.cardSoft,
            borderRadius: 10,
            padding: 3,
            marginHorizontal: 16,
            marginBottom: 12,
          }}
        >
          <Pressable
            onPress={() => setViewMode("pitch")}
            style={{
              flex: 1,
              paddingVertical: 8,
              alignItems: "center",
              borderRadius: 7,
              backgroundColor: viewMode === "pitch" ? theme.bg.card : "transparent",
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: viewMode === "pitch" ? theme.text.main : theme.text.subtle,
              }}
            >
              Pitch
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setViewMode("list")}
            style={{
              flex: 1,
              paddingVertical: 8,
              alignItems: "center",
              borderRadius: 7,
              backgroundColor: viewMode === "list" ? theme.bg.card : "transparent",
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: viewMode === "list" ? theme.text.main : theme.text.subtle,
              }}
            >
              List
            </Text>
          </Pressable>
        </View>

        {viewMode === "pitch" ? (
          <LinearGradient
            colors={["#1f9d55", "#15702f"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              marginHorizontal: 16,
              borderRadius: 16,
              paddingVertical: 20,
              paddingHorizontal: 8,
              overflow: "hidden",
            }}
          >
            {/* Faint pitch markings */}
            <View
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: 90,
                height: 90,
                marginLeft: -45,
                marginTop: -45,
                borderRadius: 45,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.15)",
              }}
            />
            <View
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: "50%",
                height: 1,
                backgroundColor: "rgba(255,255,255,0.15)",
              }}
            />

            {groupedBySlot.map(({ slot, players: slotPlayers }, groupIndex) => (
              <View
                key={slot?.id || `other-${groupIndex}`}
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  justifyContent: "space-evenly",
                  marginBottom: groupIndex < groupedBySlot.length - 1 ? 20 : 0,
                  rowGap: 16,
                }}
              >
                {slotPlayers.map((player) => (
                  <PitchPlayerCard key={player.id} player={player} />
                ))}
              </View>
            ))}
          </LinearGradient>
        ) : (
          <View
            style={{
              backgroundColor: theme.bg.card,
              marginHorizontal: 16,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: theme.border.subtle,
              overflow: "hidden",
            }}
          >
            {/* Column headers */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: theme.border.subtle,
              }}
            >
              <Text style={{ flex: 1, fontSize: 11, fontWeight: "700", color: theme.text.subtle }}>
                Player
              </Text>
              <Text style={{ width: 64, fontSize: 11, fontWeight: "700", color: theme.text.subtle, textAlign: "center" }}>
                Price
              </Text>
              <Text style={{ width: 64, fontSize: 11, fontWeight: "700", color: theme.text.subtle, textAlign: "center" }}>
                Points
              </Text>
            </View>

            {groupedBySlot.map(({ slot, players: slotPlayers }, groupIndex) => (
              <View key={slot?.id || `other-${groupIndex}`}>
                <View
                  style={{
                    paddingHorizontal: 12,
                    paddingTop: 12,
                    paddingBottom: 6,
                    backgroundColor: theme.bg.cardSoft,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "700", color: theme.text.main }}>
                    {slot?.name || "Other"}
                  </Text>
                </View>

                {slotPlayers.map((player, index) => (
                  <Pressable
                    key={player.id}
                    onPress={() => handlePlayerPress(player)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderBottomWidth: index < slotPlayers.length - 1 ? 1 : 0,
                      borderBottomColor: theme.border.subtle,
                    }}
                  >
                    {player.injury_status ? (
                      <Ionicons
                        name="warning"
                        size={14}
                        color={theme.status.warning}
                        style={{ marginRight: 6 }}
                      />
                    ) : null}
                    <PlayerImage imageUrl={player.image_url} playerName={player.name} size={34} />
                    <View style={{ flex: 1, marginLeft: 10, marginRight: 6 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Text
                          numberOfLines={1}
                          style={{ fontSize: 14, fontWeight: "600", color: theme.text.main }}
                        >
                          {player.name}
                        </Text>
                        <PlayerBadges player={player} size="tiny" />
                      </View>
                      {player.team && (
                        <Text style={{ fontSize: 11, color: theme.text.subtle, marginTop: 1 }}>
                          {player.team}
                        </Text>
                      )}
                    </View>
                    <Text style={{ width: 64, fontSize: 13, color: theme.text.main, textAlign: "center" }}>
                      {player.price}
                    </Text>
                    <Text
                      style={{
                        width: 64,
                        fontSize: 13,
                        fontWeight: "700",
                        color: theme.accent.pink.primary,
                        textAlign: "center",
                      }}
                    >
                      {getDisplayPoints(player)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ))}
          </View>
        )}

        {/* Contest Details */}
        <View
          style={{
            backgroundColor: theme.bg.card,
            padding: 16,
            marginTop: 16,
            marginHorizontal: 16,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: theme.border.subtle,
          }}
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: "700",
              color: theme.text.subtle,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              marginBottom: 8,
            }}
          >
            Contest Details
          </Text>

          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "bold",
                  color: theme.text.main,
                  marginBottom: 4,
                }}
              >
                {team.team_name}
              </Text>

              {contest && (
                <Text
                  style={{
                    fontSize: 12,
                    color: theme.accent.pink.primary,
                    fontWeight: "500",
                  }}
                >
                  {contest.name}
                </Text>
              )}
            </View>

            {team.rank && (
              <View
                style={{
                  backgroundColor: theme.bg.chip,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 6,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "700", color: theme.text.main }}>
                  Rank #{team.rank}
                </Text>
              </View>
            )}
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              marginTop: 10,
            }}
          >
            <Ionicons name="people" size={14} color={theme.text.subtle} />
            <Text
              style={{
                fontSize: 12,
                color: theme.text.subtle,
              }}
            >
              {team.player_ids.length} players
            </Text>
          </View>
        </View>
        </ScrollView>
      </SafeAreaView>

      {/* Player Detail Modal */}
      <PlayerDetailModal
        player={selectedPlayer}
        team={team}
        contest={contest}
        slots={slots}
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        theme={theme}
        onMakeCaptain={handleMakeCaptain}
        onMakeViceCaptain={handleMakeViceCaptain}
        onReplacePlayer={handleReplacePlayer}
        canEdit={canEditTeam}
        lockedReason={teamEditingLockedReason(contest)}
      />

      <ReplacePlayerModal
        visible={!!replaceTarget}
        onClose={() => setReplaceTarget(null)}
        targetPlayer={replaceTarget}
        candidates={(() => {
          if (!replaceTarget || !players) return [];
          // Candidates: same slot, not already in team
          return players.filter(
            (p) =>
              p.slot === replaceTarget.slot && !team.player_ids.includes(p.id),
          );
        })()}
        onSelect={confirmReplacement}
      />
    </View>
  );
}
