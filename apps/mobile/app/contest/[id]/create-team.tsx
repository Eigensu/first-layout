import {
  View,
  Text,
  ActivityIndicator,
  Alert,
  ScrollView,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { usePreventRemove } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { arenaService } from "../../../src/services/arenaService";
import { useTeamBuilder } from "../../../src/features/arena/hooks/useTeamBuilder";
import { TeamSummary } from "../../../src/features/arena/molecules/TeamSummary";
import { useThemeContext } from "../../../src/theme";
import { Player, TeamCreate } from "../../../src/types/arena";
import {
  arenaKeys,
  invalidateTeamQueries,
} from "../../../src/features/arena/queryKeys";
import { apiErrorMessage, UserFacingError } from "../../../src/utils/apiError";

// Import new components
import { ProgressIndicator } from "../../../src/components/team-builder/ProgressIndicator";
import { SearchBarWithFilter } from "../../../src/components/team-builder/SearchBarWithFilter";
import { SlotSelectionCard } from "../../../src/components/team-builder/SlotSelectionCard";
import { CaptainSelectionCard } from "../../../src/components/team-builder/CaptainSelectionCard";
import { PlayersList } from "../../../src/components/team-builder/PlayersList";
import { ActionButtons } from "../../../src/components/team-builder/ActionButtons";
import { TeamNameModal } from "../../../src/components/team-builder/TeamNameModal";
import { SelectedPlayersHeader } from "../../../src/components/team-builder/SelectedPlayersHeader";
import { ReplacePlayerModal } from "../../../src/components/team-builder/ReplacePlayerModal";
import { GlassButton } from "../../../src/components/ui/GlassButton";

export default function CreateTeamScreen() {
  const { theme } = useThemeContext();
  const { id: contestId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const [teamName, setTeamName] = useState("");
  const [showNameInput, setShowNameInput] = useState(false);
  const [currentSlotIndex, setCurrentSlotIndex] = useState(0);
  const [isSelectingCaptain, setIsSelectingCaptain] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "name" | "team">("all");

  // Replacement State
  const [replaceTarget, setReplaceTarget] = useState<Player | null>(null);

  // Check if user already has a team for this contest
  const { data: enrollments } = useQuery({
    queryKey: arenaKeys.enrollments(),
    queryFn: () => arenaService.getMyEnrollments(),
  });

  const { data: teams } = useQuery({
    queryKey: arenaKeys.teams(),
    queryFn: () => arenaService.getMyTeams({ limit: 100 }),
  });

  const { data: slotsData, isLoading: slotsLoading } = useQuery({
    queryKey: ["slots"],
    queryFn: () => arenaService.getSlots({ page_size: 100 }),
  });

  const { data: players, isLoading: playersLoading } = useQuery({
    queryKey: ["players", "withHotStatus", contestId],
    queryFn: () =>
      arenaService.getPlayersWithHotStatus({
        contest_id: contestId,
        limit: 500,
      }),
    enabled: !!contestId,
  });

  // A team that an earlier tap saved but couldn't enter into the contest.
  // Tapping Create again enters this team instead of making a second one;
  // the API allows one team per contest and would answer 409. The ref is
  // read by the mutation callbacks, the state by rendering.
  const savedTeamIdRef = useRef<string | null>(null);
  const [savedTeamId, setSavedTeamId] = useState<string | null>(null);
  // Which step of the last attempt failed, so the error says what happened.
  const failedStepRef = useRef<"save" | "enroll" | null>(null);

  // New teams can only join a contest before it starts (the API refuses to
  // create one for an ongoing contest). Entering a team we saved earlier
  // follows the same rule, checked against the server's status.
  const assertContestOpen = async () => {
    const contest = await arenaService.getContest(contestId);
    if (contest.status !== "live") {
      throw new UserFacingError(
        "This contest has started, so teams can't be entered any more.",
      );
    }
  };

  // Whether this team is entered in this contest, from fresh enrollments.
  const isEntered = async (teamId: string) => {
    try {
      const enrollments = await arenaService.getMyEnrollments();
      return enrollments.some(
        (e) =>
          e.team_id === teamId &&
          e.contest_id === contestId &&
          e.status === "active",
      );
    } catch {
      return false;
    }
  };

  // Creates the team, or saves the picks onto a team this user already has
  // for this contest that was never entered. That's either one an earlier
  // tap here saved, or one left behind before this fix, when a failed enroll
  // was retried by creating the team again and the API refused with 409.
  // Without this, those users get the same 409 on every attempt.
  const saveSquad = async (squad: Omit<TeamCreate, "contest_id">) => {
    if (savedTeamIdRef.current) {
      await assertContestOpen();
      return arenaService.updateTeam(savedTeamIdRef.current, squad);
    }
    try {
      return await arenaService.createTeam({ ...squad, contest_id: contestId });
    } catch (error: any) {
      if (error?.response?.status !== 409) throw error;
      // 409 can mean "one team per contest" or "contest started". Reuse a
      // team only while the contest is open, and only one that isn't
      // entered: overwriting an entered team (when this screen's
      // enrollments were stale) would silently replace the user's squad.
      const lookup = await Promise.all([
        arenaService.getContest(contestId),
        arenaService.getMyTeams({ limit: 100 }),
        arenaService.getMyEnrollments(),
      ]).catch(() => null);
      if (!lookup) throw error;
      const [contest, { teams: myTeams }, myEnrollments] = lookup;
      const entered = new Set(
        myEnrollments.filter((e) => e.status === "active").map((e) => e.team_id),
      );
      const leftover = myTeams.find(
        (t) => t.contest_id === contestId && !entered.has(t.id),
      );
      if (contest.status !== "live" || !leftover) throw error;
      return arenaService.updateTeam(leftover.id, squad);
    }
  };

  const createTeamMutation = useMutation({
    // Never retry automatically. The global retry re-ran this whole function
    // when the enroll step failed, so the team was POSTed again, the API
    // rejected it with 409, the user saw "only one team per contest", and the
    // team they'd built was never entered.
    retry: 0,
    mutationFn: async (data: { teamName: string }) => {
      const squad = {
        team_name: data.teamName,
        player_ids: Array.from(selectedPlayerIds),
        captain_id: captainId!,
        vice_captain_id: viceCaptainId!,
      };
      // Saving the picks on a retry too: they may have changed since the
      // failed attempt.
      failedStepRef.current = "save";
      const team = await saveSquad(squad);
      savedTeamIdRef.current = team.id;
      setSavedTeamId(team.id);

      failedStepRef.current = "enroll";
      try {
        await arenaService.enrollInContest(contestId, team.id);
      } catch (error) {
        // The enroll can succeed with only its reply lost (a timeout). If
        // the team shows up as entered, that's a success.
        if (!(await isEntered(team.id))) throw error;
      }
      failedStepRef.current = null;
      return team;
    },
    onSuccess: (team) => {
      // Home, My Teams, Contests and contest detail all read the shared
      // team, enrollment and leaderboard keys, so this refreshes every one.
      invalidateTeamQueries(queryClient, { teamId: team.id, contestId });
      Alert.alert(
        "Success",
        "Team created and enrolled!",
        [{ text: "OK", onPress: () => router.back() }],
        { cancelable: false },
      );
    },
    onError: (error: any) => {
      const teamId = savedTeamIdRef.current;
      if (teamId) {
        // The team exists, so refresh the lists that show it.
        invalidateTeamQueries(queryClient, { teamId, contestId });
      }
      if (failedStepRef.current === "enroll") {
        Alert.alert(
          "Team saved, not entered",
          `${apiErrorMessage(error, "Couldn't enter the contest.")}\n\nYour team is saved. Tap Create Team again to enter it.`,
        );
        return;
      }
      Alert.alert(
        "Error",
        apiErrorMessage(
          error,
          teamId
            ? "Couldn't save your changes to the team."
            : "Failed to create team",
        ),
      );
    },
  });

  const slots = slotsData?.slots || [];
  const allPlayers = players || [];

  const {
    selectedPlayerIds,
    captainId,
    viceCaptainId,
    stats,
    togglePlayer,
    setCaptain,
    setViceCaptain,
    resetSelection,
    canSubmit,
    replacePlayer,
  } = useTeamBuilder({
    players: allPlayers,
    slots,
  });

  // Once this screen has saved (or is saving) the team, the enrollment that
  // shows up in ["enrollments"] is our own — not a pre-existing team.
  const isTeamSaved =
    createTeamMutation.isPending || createTeamMutation.isSuccess;

  // Check if user already has a team enrolled in this contest.
  //
  // This used to be an early `return null` placed *above* the slots/players
  // queries, the mutation and useTeamBuilder. Right after a successful
  // create, onSuccess invalidates ["enrollments"]; the refetch then contains
  // the new enrollment, so the next render bailed out before those hooks ran
  // — React threw "Rendered fewer hooks than expected" and the app crashed.
  // It also called Alert + router.back() during render (double back). Now
  // every hook runs unconditionally, the redirect lives in an effect, and
  // it's skipped for the team this screen just created.
  const hasExistingTeam =
    !!enrollments?.some(
      (e) =>
        e.contest_id === contestId &&
        e.status === "active" &&
        // After a failed enroll the enrollments are refetched. If the enroll
        // actually went through, that's still the team this screen made.
        e.team_id !== savedTeamId,
    ) && !isTeamSaved;

  useEffect(() => {
    if (!hasExistingTeam) return;
    Alert.alert(
      "Team Already Exists",
      "You can only create one team per contest. Please manage your existing team.",
      [{ text: "OK", onPress: () => router.back() }],
      { cancelable: false },
    );
  }, [hasExistingTeam, router]);

  // Ask before leaving a half-built team — covers the header back button,
  // Android back, and (on iOS) swiping the modal sheet down, which native
  // stack cancels and routes through here while this is enabled. Turned off
  // after a successful save so the success alert's router.back() goes
  // through without a prompt.
  const hasUnsavedProgress =
    selectedPlayerIds.size > 0 && !createTeamMutation.isSuccess;
  usePreventRemove(hasUnsavedProgress, ({ data }) => {
    Alert.alert(
      savedTeamId ? "Leave without entering?" : "Exit team builder?",
      savedTeamId
        ? "Your team is saved but isn't entered in this contest. Come back and tap Create Team to enter it."
        : "Your player selections will be lost.",
      [
        { text: "Keep Building", style: "cancel" },
        {
          text: "Exit",
          style: "destructive",
          onPress: () => navigation.dispatch(data.action),
        },
      ],
    );
  });

  // Get current slot being selected
  const currentSlot = slots[currentSlotIndex];

  // Filter players for current slot
  const currentSlotPlayers = currentSlot
    ? allPlayers.filter((p) => p.slot === currentSlot.id)
    : [];

  // Filter players by search query and filter type
  const filteredCurrentSlotPlayers = currentSlotPlayers.filter((player) => {
    if (!searchQuery) return true;

    const query = searchQuery.toLowerCase();
    switch (filterType) {
      case "name":
        return player.name.toLowerCase().includes(query);
      case "team":
        return player.team && player.team.toLowerCase().includes(query);
      case "all":
      default:
        return (
          player.name.toLowerCase().includes(query) ||
          (player.team && player.team.toLowerCase().includes(query))
        );
    }
  });

  // Filter selected players for captain selection
  const filteredSelectedPlayers = Array.from(selectedPlayerIds)
    .map((id) => allPlayers.find((p) => p.id === id))
    .filter((item): item is NonNullable<typeof item> => item !== undefined)
    .filter((player) => {
      if (!searchQuery) return true;

      const query = searchQuery.toLowerCase();
      switch (filterType) {
        case "name":
          return player.name.toLowerCase().includes(query);
        case "team":
          return player.team && player.team.toLowerCase().includes(query);
        case "all":
        default:
          return (
            player.name.toLowerCase().includes(query) ||
            (player.team && player.team.toLowerCase().includes(query))
          );
      }
    });

  // Get selected players for current slot
  const currentSlotSelectedCount = currentSlot
    ? stats.slotCounts[currentSlot.id] || 0
    : 0;

  // Check if current slot requirements are met
  const canProceedFromCurrentSlot = currentSlot
    ? currentSlotSelectedCount >= currentSlot.min_select &&
      currentSlotSelectedCount <= currentSlot.max_select
    : false;

  // Slot has hit its cap: lock the rest of the cards in this slot.
  const isCurrentSlotFull = currentSlot
    ? currentSlotSelectedCount >= currentSlot.max_select
    : false;

  const handleReplacePlayer = (newPlayerId: string) => {
    if (!replaceTarget) return;

    const result = replacePlayer(replaceTarget.id, newPlayerId);
    if (result.success) {
      setReplaceTarget(null);
    } else if (result.error) {
      Alert.alert("Error", result.error);
    }
  };

  // Event handlers
  const handleTogglePlayer = (player: Player) => {
    const result = togglePlayer(player);
    if (!result.success && result.error) {
      Alert.alert("Error", result.error);
    }
  };

  const handleClearAll = () => {
    resetSelection();
    setCurrentSlotIndex(0);
    setIsSelectingCaptain(false);
    setIsReviewing(false);
    setReplaceTarget(null);
  };

  const handleNextSlot = () => {
    setSearchQuery("");
    if (currentSlotIndex < slots.length - 1) {
      setCurrentSlotIndex(currentSlotIndex + 1);
    } else {
      setIsSelectingCaptain(true);
    }
  };

  const handleSlotPress = (slotIndex: number) => {
    if (slotIndex < slots.length && !isSelectingCaptain && !isReviewing) {
      setCurrentSlotIndex(slotIndex);
      setSearchQuery("");
    }
  };

  const handlePreviousSlot = () => {
    setSearchQuery("");
    if (isReviewing) {
      setIsReviewing(false);
      setIsSelectingCaptain(true);
    } else if (isSelectingCaptain) {
      setIsSelectingCaptain(false);
      setCurrentSlotIndex(slots.length - 1);
    } else if (currentSlotIndex > 0) {
      setCurrentSlotIndex(currentSlotIndex - 1);
    }
  };

  const handleNext = () => {
    if (isReviewing) {
      if (!canSubmit) {
        Alert.alert("Invalid Team", "Please complete your team selection");
        return;
      }
      if (!teamName.trim()) {
        setShowNameInput(true);
        return;
      }
      createTeamMutation.mutate({ teamName: teamName.trim() });
    } else if (isSelectingCaptain) {
      if (!captainId || !viceCaptainId) {
        Alert.alert(
          "Missing Selection",
          "Please select both Captain and Vice-Captain",
        );
        return;
      }
      setIsSelectingCaptain(false);
      setIsReviewing(true);
    } else {
      if (!canProceedFromCurrentSlot) {
        Alert.alert(
          "Incomplete Selection",
          `Please select ${currentSlot.min_select}-${currentSlot.max_select} ${currentSlot.name.toLowerCase()}`,
        );
        return;
      }
      handleNextSlot();
    }
  };

  const getNextButtonText = () => {
    if (isReviewing) return "Create Team";
    if (isSelectingCaptain) return "Continue to Review";
    if (currentSlotIndex === slots.length - 1) return "Select Captain";
    return "Next Slot";
  };

  const getSearchPlaceholder = () => {
    if (isSelectingCaptain) {
      return filterType === "all"
        ? "Search your selected players..."
        : filterType === "name"
          ? "Search by player name..."
          : "Search by team name...";
    }

    return filterType === "all"
      ? `Search ${currentSlot?.name.toLowerCase() || "players"}...`
      : filterType === "name"
        ? "Search by player name..."
        : "Search by team name...";
  };

  // Safe now: every hook above has already run this render.
  if (hasExistingTeam) {
    return null;
  }

  if (slotsLoading || playersLoading) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.bg.elevated,
        }}
        edges={["top"]}
      >
        <ActivityIndicator size="large" color={theme.accent.pink.primary} />
        <Text
          style={{
            marginTop: 16,
            color: theme.text.muted,
            fontSize: 16,
          }}
        >
          Loading team builder...
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <>
      <TeamNameModal
        visible={showNameInput}
        teamName={teamName}
        onTeamNameChange={setTeamName}
        onCancel={() => setShowNameInput(false)}
        onConfirm={() => {
          if (!teamName.trim()) {
            Alert.alert("Error", "Please enter a team name");
            return;
          }
          createTeamMutation.mutate({ teamName: teamName.trim() });
        }}
        isLoading={createTeamMutation.isPending}
      />

      <SafeAreaView
        style={{ flex: 1, backgroundColor: theme.bg.elevated }}
        edges={["top"]}
      >
        {/* Header */}
        <View
          style={{
            backgroundColor: theme.bg.elevated,
            paddingHorizontal: 16,
            paddingVertical: 16,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Pressable
            onPress={() => router.back()}
            style={{
              backgroundColor: theme.bg.card,
              padding: 10,
              borderRadius: 12,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.1,
              shadowRadius: 4,
              elevation: 2,
            }}
          >
            <Ionicons name="chevron-back" size={20} color={theme.text.main} />
          </Pressable>

          <Text
            style={{
              fontSize: 18,
              fontWeight: "700",
              color: theme.text.main,
              letterSpacing: 0.5,
            }}
          >
            Create Team
          </Text>

          <GlassButton
            title="Clear All"
            onPress={handleClearAll}
            variant="outline"
            size="sm"
            textStyle={{ fontSize: 12 }}
          />
        </View>

        <ProgressIndicator
          slots={slots}
          currentSlotIndex={currentSlotIndex}
          isSelectingCaptain={isSelectingCaptain}
          isReviewing={isReviewing}
        />

        {/* Selected Players Header - Fixed at top */}
        {!isReviewing && (
          <SelectedPlayersHeader
            players={allPlayers}
            selectedPlayerIds={selectedPlayerIds}
            totalRequired={stats.total}
            captainId={captainId || undefined}
            viceCaptainId={viceCaptainId || undefined}
            onClearAll={handleClearAll}
            onPlayerPress={(p) => setReplaceTarget(p)}
          />
        )}

        <ReplacePlayerModal
          visible={!!replaceTarget}
          onClose={() => setReplaceTarget(null)}
          targetPlayer={replaceTarget}
          candidates={(() => {
            if (!replaceTarget) return [];
            const targetSlot = replaceTarget.slot;
            return allPlayers.filter(
              (p) => p.slot === targetSlot && !selectedPlayerIds.has(p.id),
            );
          })()}
          onSelect={handleReplacePlayer}
        />

        <ScrollView style={{ flex: 1, backgroundColor: theme.bg.body }}>
          {/* Slot Selection */}
          {!isSelectingCaptain && !isReviewing && currentSlot && (
            <View
              style={{
                paddingTop: 4,
                paddingHorizontal: 12,
                paddingBottom: 12,
              }}
            >
              <SlotSelectionCard
                currentSlot={currentSlot}
                currentSlotSelectedCount={currentSlotSelectedCount}
                canProceedFromCurrentSlot={canProceedFromCurrentSlot}
                totalTeamCount={stats.count}
              />

              <SearchBarWithFilter
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                filterType={filterType}
                onFilterChange={setFilterType}
                placeholder={getSearchPlaceholder()}
              />

              <PlayersList
                players={filteredCurrentSlotPlayers}
                selectedPlayerIds={selectedPlayerIds}
                onTogglePlayer={handleTogglePlayer}
                showCaptainOptions={false}
                disableUnselected={isCurrentSlotFull}
                emptyStateMessage={
                  searchQuery
                    ? `No ${currentSlot.name.toLowerCase()} found for "${searchQuery}"`
                    : `No ${currentSlot.name.toLowerCase()} available`
                }
                searchQuery={searchQuery}
                onClearSearch={() => setSearchQuery("")}
              />
            </View>
          )}

          {/* Captain Selection */}
          {isSelectingCaptain && (
            <View
              style={{
                paddingTop: 4,
                paddingHorizontal: 12,
                paddingBottom: 12,
              }}
            >
              <CaptainSelectionCard
                captainId={captainId || ""}
                viceCaptainId={viceCaptainId || ""}
              />

              <SearchBarWithFilter
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                filterType={filterType}
                onFilterChange={setFilterType}
                placeholder={getSearchPlaceholder()}
              />

              <PlayersList
                players={filteredSelectedPlayers}
                selectedPlayerIds={selectedPlayerIds}
                captainId={captainId || undefined}
                viceCaptainId={viceCaptainId || undefined}
                onTogglePlayer={() => {}}
                onSetCaptain={setCaptain}
                onSetViceCaptain={setViceCaptain}
                showCaptainOptions={true}
                showSelectionIndicator={false}
              />
            </View>
          )}

          {/* Review Team */}
          {isReviewing && (
            <View
              style={{
                paddingTop: 4,
                paddingHorizontal: 12,
                paddingBottom: 12,
              }}
            >
              <View
                style={{
                  backgroundColor: theme.bg.card,
                  borderRadius: 16,
                  padding: 16,
                  marginBottom: 12,
                  borderWidth: 1,
                  borderColor: theme.border.subtle,
                }}
              >
                <Text
                  style={{
                    fontSize: 20,
                    fontWeight: "bold",
                    color: theme.text.main,
                    marginBottom: 8,
                  }}
                >
                  Review Your Team
                </Text>
                <Text
                  style={{
                    fontSize: 14,
                    color: theme.text.muted,
                    marginBottom: 12,
                  }}
                >
                  Final check before creating your team
                </Text>

                <TeamSummary
                  count={stats.count}
                  slotCounts={stats.slotCounts}
                  slotViolations={stats.slotViolations}
                  slots={slots}
                  teamName={teamName}
                  onTeamNameChange={setTeamName}
                  showTeamNameInput={true}
                />
              </View>

              <PlayersList
                players={Array.from(selectedPlayerIds)
                  .map((id) => allPlayers.find((p) => p.id === id))
                  .filter(
                    (item): item is NonNullable<typeof item> =>
                      item !== undefined,
                  )}
                selectedPlayerIds={selectedPlayerIds}
                captainId={captainId || undefined}
                viceCaptainId={viceCaptainId || undefined}
                onTogglePlayer={() => {}}
                showCaptainOptions={false}
                showSelectionIndicator={false}
              />
            </View>
          )}
        </ScrollView>

        <ActionButtons
          showPrevious={
            currentSlotIndex > 0 || isSelectingCaptain || isReviewing
          }
          onPrevious={handlePreviousSlot}
          onNext={handleNext}
          isNextDisabled={
            (!isReviewing &&
              !isSelectingCaptain &&
              !canProceedFromCurrentSlot) ||
            (isSelectingCaptain && (!captainId || !viceCaptainId)) ||
            (isReviewing && !canSubmit)
          }
          nextButtonText={getNextButtonText()}
          isLoading={createTeamMutation.isPending}
        />
      </SafeAreaView>
    </>
  );
}
